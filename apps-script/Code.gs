/**
 * Secretaría Nebrija · conexión con Google Sheets
 * ------------------------------------------------
 * Pega este código en Extensiones → Apps Script de TU hoja de cálculo
 * y despliégalo como aplicación web (ver README o la ayuda dentro de la app).
 *
 * Antes de desplegar, define la propiedad de la secuencia de comandos:
 *   Configuración del proyecto (⚙) → Propiedades de la secuencia de comandos → CLAVE = (la clave que quieras)
 *
 * La app web se ejecuta con tu cuenta y solo responde a quien envíe esa CLAVE.
 * La hoja crea sola estas pestañas:
 *   Censo        · lista de colegiales (la lee y la escribe la app)
 *   Categorías   · categorías de asistencia y puntos por asistencia
 *   Sesiones     · una fila por sesión de «Pasar lista»
 *   Asistencia   · una fila por persona y sesión (P/A/J)
 *   Totales      · resumen por persona (se recalcula en cada sincronización)
 */

var HOJAS = {
  censo: "Censo",
  categorias: "Categorías",
  sesiones: "Sesiones",
  asistencia: "Asistencia",
  totales: "Totales"
};
var CABECERAS = {
  censo: ["Apellido 1", "Apellido 2", "Nombre", "Teléfono", "Habitación", "DNI", "Email", "Estudios"],
  categorias: ["Id", "Nombre", "Puntos", "Modificado", "Borrada"],
  sesiones: ["Id", "Fecha", "CategoríaId", "Categoría", "Título", "Modificado", "Borrada"],
  asistencia: ["SesiónId", "Fecha", "Categoría", "Título", "Clave", "Apellidos", "Nombre", "Habitación", "Estado", "Puntos"]
};
// columnas numéricas (el resto se guarda como texto para que Sheets no convierta fechas ni números)
var NUMERICAS = {
  categorias: [3, 4],
  sesiones: [6],
  asistencia: [10]
};
var ESTADO_TEXTO = { P: "Presente", A: "Ausente", J: "Justificado" };
var ESTADO_CODIGO = { "Presente": "P", "Ausente": "A", "Justificado": "J" };

function doGet() {
  return salida({ ok: true, mensaje: "Secretaría Nebrija: la conexión está activa. Abre la aplicación para usarla." });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  var bloqueado = false;
  try {
    var pet = JSON.parse(e.postData.contents);
    var clave = PropertiesService.getScriptProperties().getProperty("CLAVE");
    if (!clave) return salida({ ok: false, error: "Falta definir la propiedad CLAVE en el script (Configuración del proyecto → Propiedades)." });
    if (!pet.token || String(pet.token) !== String(clave)) return salida({ ok: false, error: "La clave no coincide con la del script." });
    lock.waitLock(25000);
    bloqueado = true;

    switch (pet.accion) {
      case "ping":
        return salida({ ok: true, hoja: SpreadsheetApp.getActiveSpreadsheet().getName() });
      case "censo_leer":
        return censoLeer();
      case "censo_escribir":
        return censoEscribir(pet.valores);
      case "todo":
        return todo();
      case "lista_guardar":
        return listaGuardar(pet);
      default:
        return salida({ ok: false, error: "Acción desconocida: " + pet.accion });
    }
  } catch (err) {
    return salida({ ok: false, error: String((err && err.message) || err) });
  } finally {
    if (bloqueado) { try { lock.releaseLock(); } catch (x) {} }
  }
}

/* ---------------- censo ---------------- */

function censoLeer() {
  var h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.censo);
  if (!h) return salida({ ok: false, error: "No existe la pestaña «Censo» en la hoja. Créala con cabeceras (Apellidos, Nombre, Teléfono, Habitación, DNI…) o súbela desde la app." });
  var valores = h.getDataRange().getDisplayValues();
  return salida({ ok: true, valores: valores });
}

function censoEscribir(valores) {
  if (!valores || !valores.length) return salida({ ok: false, error: "No hay datos que escribir." });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var h = ss.getSheetByName(HOJAS.censo) || ss.insertSheet(HOJAS.censo);
  h.clearContents();
  var filas = valores.length, cols = valores[0].length;
  var rango = h.getRange(1, 1, filas, cols);
  rango.setNumberFormat("@");
  rango.setValues(valores);
  h.getRange(1, 1, 1, cols).setFontWeight("bold");
  h.setFrozenRows(1);
  return salida({ ok: true, filas: filas - 1 });
}

/* ---------------- lista de asistencia ---------------- */

function todo() {
  var categorias = leerTabla("categorias").map(function (r) {
    return { id: r[0], nombre: r[1], puntos: Number(r[2]) || 0, mod: Number(r[3]) || 0, borrada: !!r[4] };
  });
  var sesiones = leerTabla("sesiones").map(function (r) {
    return { id: r[0], fecha: r[1], cat: r[2], titulo: r[4], mod: Number(r[5]) || 0, borrada: !!r[6] };
  });
  var asistencia = leerTabla("asistencia").map(function (r) {
    return { sid: r[0], clave: r[4], estado: ESTADO_CODIGO[r[8]] || "" };
  }).filter(function (a) { return a.estado; });
  return salida({ ok: true, categorias: categorias, sesiones: sesiones, asistencia: asistencia });
}

function listaGuardar(pet) {
  // categorías
  var cats = leerTabla("categorias");
  var porId = {};
  cats.forEach(function (r, i) { porId[r[0]] = i; });
  (pet.categorias || []).forEach(function (c) {
    var fila = [c.id, c.nombre, Number(c.puntos) || 0, Number(c.mod) || 0, ""];
    if (porId[c.id] !== undefined) cats[porId[c.id]] = fila; else { porId[c.id] = cats.length; cats.push(fila); }
  });
  (pet.categoriasBorradas || []).forEach(function (id) {
    if (porId[id] !== undefined) cats[porId[id]][4] = 1;
  });
  escribirTabla("categorias", cats);

  // sesiones y asistencia
  var ses = leerTabla("sesiones");
  var asis = leerTabla("asistencia");
  var sesPorId = {};
  ses.forEach(function (r, i) { sesPorId[r[0]] = i; });

  var reemplazar = {};
  (pet.sesiones || []).forEach(function (s) { reemplazar[s.id] = true; });
  (pet.sesionesBorradas || []).forEach(function (id) { reemplazar[id] = true; });
  asis = asis.filter(function (r) { return !reemplazar[r[0]]; });

  (pet.sesiones || []).forEach(function (s) {
    var fila = [s.id, s.fecha, s.cat, s.catNombre || "", s.titulo || "", Number(s.mod) || 0, ""];
    if (sesPorId[s.id] !== undefined) ses[sesPorId[s.id]] = fila; else { sesPorId[s.id] = ses.length; ses.push(fila); }
    (s.marcas || []).forEach(function (m) {
      asis.push([s.id, s.fecha, s.catNombre || "", s.titulo || "", m.k, m.a || "", m.n || "", m.h || "",
                 ESTADO_TEXTO[m.e] || m.e, Number(m.p) || 0]);
    });
  });
  (pet.sesionesBorradas || []).forEach(function (id) {
    if (sesPorId[id] !== undefined) ses[sesPorId[id]][6] = 1;
  });
  escribirTabla("sesiones", ses);
  escribirTabla("asistencia", asis);

  actualizarTotales();
  return salida({ ok: true });
}

function actualizarTotales() {
  var cats = leerTabla("categorias").filter(function (r) { return !r[4]; });
  var nombresCat = cats.map(function (r) { return r[1]; });
  var asis = leerTabla("asistencia");
  var por = {};
  asis.forEach(function (r) {
    var k = r[4];
    if (!por[k]) por[k] = { a: r[5], n: r[6], h: r[7], pts: {}, total: 0, P: 0, A: 0, J: 0 };
    var x = por[k], cat = r[2], est = ESTADO_CODIGO[r[8]];
    if (est) x[est]++;
    var p = Number(r[9]) || 0;
    x.pts[cat] = (x.pts[cat] || 0) + p;
    x.total += p;
    if (nombresCat.indexOf(cat) < 0) nombresCat.push(cat);
  });
  var cab = ["Apellidos", "Nombre", "Habitación"].concat(nombresCat.map(function (c) { return "Puntos · " + c; }))
    .concat(["Puntos totales", "Presente", "Ausente", "Justificado"]);
  var filas = Object.keys(por).map(function (k) { return por[k]; })
    .sort(function (a, b) { return (b.total - a.total) || String(a.a).localeCompare(String(b.a)); })
    .map(function (x) {
      return [x.a, x.n, x.h].concat(nombresCat.map(function (c) { return Math.round((x.pts[c] || 0) * 10) / 10; }))
        .concat([Math.round(x.total * 10) / 10, x.P, x.A, x.J]);
    });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var h = ss.getSheetByName(HOJAS.totales) || ss.insertSheet(HOJAS.totales);
  h.clearContents();
  h.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight("bold");
  if (filas.length) {
    var r = h.getRange(2, 1, filas.length, cab.length);
    r.setNumberFormat("General");
    r.setValues(filas);
  }
  h.setFrozenRows(1);
}

/* ---------------- utilidades ---------------- */

function hoja(clave) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var h = ss.getSheetByName(HOJAS[clave]);
  if (!h) {
    h = ss.insertSheet(HOJAS[clave]);
    h.getRange(1, 1, 1, CABECERAS[clave].length).setValues([CABECERAS[clave]]).setFontWeight("bold");
    h.setFrozenRows(1);
  }
  return h;
}

function aTexto(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  return v === null || v === undefined ? "" : v;
}

function leerTabla(clave) {
  var h = hoja(clave);
  var n = h.getLastRow();
  if (n < 2) return [];
  var w = CABECERAS[clave].length;
  var num = NUMERICAS[clave] || [];
  return h.getRange(2, 1, n - 1, w).getValues().map(function (fila) {
    return fila.map(function (v, i) { return num.indexOf(i + 1) >= 0 ? v : aTexto(v); });
  });
}

function escribirTabla(clave, filas) {
  var h = hoja(clave);
  var w = CABECERAS[clave].length;
  var n = h.getLastRow();
  if (n > 1) h.getRange(2, 1, n - 1, w).clearContent();
  if (!filas.length) return;
  var rango = h.getRange(2, 1, filas.length, w);
  // columnas de texto con formato de texto; numéricas con formato numérico
  var num = NUMERICAS[clave] || [];
  for (var c = 1; c <= w; c++) {
    h.getRange(2, c, filas.length, 1).setNumberFormat(num.indexOf(c) >= 0 ? "General" : "@");
  }
  rango.setValues(filas);
}

function salida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
