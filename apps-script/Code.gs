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
 *
 * ACCESO A GOOGLE DRIVE (opcional, desactivado por defecto)
 *   Para que la app pueda ver, buscar, mover, renombrar y leer tus archivos de Drive,
 *   añade además la propiedad  DRIVE_ACCESO = si  y vuelve a implementar el script
 *   (Google te pedirá un permiso nuevo, solo la primera vez). Quien tenga la CLAVE
 *   tendrá entonces acceso a tu Drive: trátala como una contraseña.
 */
var VERSION_SCRIPT = 2;

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
        return salida({ ok: true, hoja: SpreadsheetApp.getActiveSpreadsheet().getName(),
                        version: VERSION_SCRIPT, drive: driveActivo() });
      case "censo_leer":
        return censoLeer();
      case "censo_escribir":
        return censoEscribir(pet.valores);
      case "todo":
        return todo();
      case "lista_guardar":
        return listaGuardar(pet);
      default:
        if (String(pet.accion).indexOf("drive_") === 0) {
          if (!driveActivo()) return salida({ ok: false, codigo: "drive_off",
            error: "El acceso a Drive está desactivado. En el script añade la propiedad DRIVE_ACCESO = si y crea una nueva versión de la implementación." });
          return driveAccion(pet);
        }
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


/* ---------------- Google Drive ---------------- */

var MIME_CARPETA = "application/vnd.google-apps.folder";
var MIME_DOC = "application/vnd.google-apps.document";
var MIME_HOJA = "application/vnd.google-apps.spreadsheet";
var MIME_ATAJO = "application/vnd.google-apps.shortcut";
var TIPOS_BUSQUEDA = {
  word: "mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' or mimeType = '" + MIME_DOC + "'",
  excel: "mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType = 'application/vnd.ms-excel' or mimeType = '" + MIME_HOJA + "' or mimeType = 'text/csv'",
  pdf: "mimeType = 'application/pdf'",
  imagen: "mimeType contains 'image/'"
};
var MAX_LISTA = 400;
var MAX_BYTES = 20 * 1024 * 1024;

function driveActivo() {
  return String(PropertiesService.getScriptProperties().getProperty("DRIVE_ACCESO") || "").toLowerCase() === "si";
}

function driveAccion(pet) {
  switch (pet.accion) {
    case "drive_listar":      return driveListar(pet.carpeta);
    case "drive_buscar":      return driveBuscar(pet.texto, pet.tipo);
    case "drive_recientes":   return driveRecientes();
    case "drive_carpetas":    return driveCarpetas();
    case "drive_leer":        return driveLeer(pet.id);
    case "drive_mover":       return driveMover(pet.ids, pet.destino);
    case "drive_renombrar":   return driveRenombrar(pet.cambios);
    case "drive_carpeta_nueva": return driveCarpetaNueva(pet.nombre, pet.padre);
    case "drive_papelera":    return drivePapelera(pet.ids);
    case "drive_copiar":      return driveCopiar(pet.id, pet.titulo);
    case "drive_crear":       return driveCrear(pet);
    case "drive_reemplazar_doc": return driveReemplazarDoc(pet);
    default: return salida({ ok: false, error: "Acción de Drive desconocida: " + pet.accion });
  }
}

function comillas(t) { return String(t).replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }

function propietario(f) {
  try { var o = f.getOwner(); return o ? o.getEmail() : ""; } catch (e) { return ""; }
}
function padreDe(f) {
  try { var it = f.getParents(); return it.hasNext() ? it.next().getId() : ""; } catch (e) { return ""; }
}
function fichaArchivo(f, esCarpeta) {
  var mime = esCarpeta ? MIME_CARPETA : f.getMimeType();
  var tam = 0;
  if (!esCarpeta) { try { tam = f.getSize(); } catch (e) {} }
  return {
    id: f.getId(), title: f.getName(), mimeType: mime,
    modifiedTime: f.getLastUpdated().toISOString(),
    size: tam, viewUrl: f.getUrl(), parentId: padreDe(f), owner: propietario(f)
  };
}
function cogerHasta(iterador, esCarpeta, lista, tope) {
  while (iterador.hasNext() && lista.length < tope) lista.push(fichaArchivo(iterador.next(), esCarpeta));
}
function ordenarFichas(lista) {
  lista.sort(function (a, b) {
    var ca = a.mimeType === MIME_CARPETA ? 0 : 1, cb = b.mimeType === MIME_CARPETA ? 0 : 1;
    if (ca !== cb) return ca - cb;
    return String(a.title).toLowerCase() < String(b.title).toLowerCase() ? -1 : 1;
  });
  return lista;
}
function carpetaPorId(id) {
  return (!id || id === "root") ? DriveApp.getRootFolder() : DriveApp.getFolderById(id);
}
function elementoPorId(id) {
  try { return { el: DriveApp.getFileById(id), carpeta: false }; }
  catch (e) { return { el: DriveApp.getFolderById(id), carpeta: true }; }
}

function driveListar(carpetaId) {
  var c = carpetaPorId(carpetaId), lista = [];
  cogerHasta(c.getFolders(), true, lista, MAX_LISTA);
  cogerHasta(c.getFiles(), false, lista, MAX_LISTA);
  return salida({ ok: true, id: c.getId(), nombre: c.getName(), archivos: ordenarFichas(lista) });
}

function driveBuscar(texto, tipo) {
  var t = String(texto || "").trim();
  var q = "trashed = false";
  if (t) q += " and (title contains '" + comillas(t) + "' or fullText contains '" + comillas(t) + "')";
  var lista = [];
  if (tipo === "carpeta") {
    cogerHasta(DriveApp.searchFolders(q), true, lista, MAX_LISTA);
  } else {
    if (tipo && TIPOS_BUSQUEDA[tipo]) q += " and (" + TIPOS_BUSQUEDA[tipo] + ")";
    q += " and mimeType != '" + MIME_ATAJO + "'";
    if (!tipo || tipo === "todo") cogerHasta(DriveApp.searchFolders("trashed = false" + (t ? " and title contains '" + comillas(t) + "'" : "")), true, lista, 40);
    cogerHasta(DriveApp.searchFiles(q), false, lista, MAX_LISTA);
  }
  return salida({ ok: true, archivos: ordenarFichas(lista) });
}

function driveRecientes() {
  var desde = new Date(Date.now() - 45 * 24 * 3600 * 1000);
  var q = "trashed = false and modifiedDate > '" + Utilities.formatDate(desde, "UTC", "yyyy-MM-dd") + "' and mimeType != '" + MIME_CARPETA + "'";
  var lista = [];
  cogerHasta(DriveApp.searchFiles(q), false, lista, 300);
  lista.sort(function (a, b) { return a.modifiedTime < b.modifiedTime ? 1 : -1; });
  return salida({ ok: true, archivos: lista.slice(0, 40) });
}

function driveCarpetas() {
  var lista = [];
  cogerHasta(DriveApp.searchFolders("trashed = false"), true, lista, 300);
  return salida({ ok: true, carpetas: lista.map(function (f) { return { id: f.id, title: f.title }; })
    .sort(function (a, b) { return String(a.title).toLowerCase() < String(b.title).toLowerCase() ? -1 : 1; }) });
}

function driveLeer(id) {
  var f = DriveApp.getFileById(id), mime = f.getMimeType(), nombre = f.getName();
  if (mime === MIME_DOC) {
    return salida({ ok: true, tipo: "texto", nombre: nombre, mimeType: mime, texto: DocumentApp.openById(id).getBody().getText() });
  }
  if (mime === MIME_HOJA) {
    var hojas = SpreadsheetApp.openById(id).getSheets().slice(0, 12).map(function (h) {
      var n = h.getLastRow(), m = h.getLastColumn();
      var v = (n && m) ? h.getRange(1, 1, Math.min(n, 5000), m).getDisplayValues() : [];
      return { nombre: h.getName(), valores: v };
    });
    return salida({ ok: true, tipo: "tabla", nombre: nombre, mimeType: mime, hojas: hojas });
  }
  if (/^text\//.test(mime) || mime === "application/json") {
    return salida({ ok: true, tipo: "texto", nombre: nombre, mimeType: mime, texto: f.getBlob().getDataAsString("UTF-8") });
  }
  if (/\.(csv|txt|tsv)$/i.test(nombre)) {
    return salida({ ok: true, tipo: "texto", nombre: nombre, mimeType: mime, texto: f.getBlob().getDataAsString("UTF-8") });
  }
  if (/spreadsheetml|ms-excel|wordprocessingml|msword|opendocument/.test(mime)) {
    if (f.getSize() > MAX_BYTES) return salida({ ok: false, error: "El archivo pesa demasiado para leerlo desde el móvil (más de 20 MB)." });
    return salida({ ok: true, tipo: "binario", nombre: nombre, mimeType: mime, base64: Utilities.base64Encode(f.getBlob().getBytes()) });
  }
  return salida({ ok: true, tipo: "no", nombre: nombre, mimeType: mime });
}

function driveMover(ids, destino) {
  var d = carpetaPorId(destino), hechos = 0, fallos = [];
  (ids || []).forEach(function (id) {
    try { elementoPorId(id).el.moveTo(d); hechos++; } catch (e) { fallos.push(id); }
  });
  return salida({ ok: true, movidos: hechos, fallos: fallos });
}

function driveRenombrar(cambios) {
  var hechos = 0, fallos = [];
  (cambios || []).forEach(function (c) {
    try { if (!c.title) throw new Error("vacío"); elementoPorId(c.id).el.setName(c.title); hechos++; } catch (e) { fallos.push(c.id); }
  });
  return salida({ ok: true, renombrados: hechos, fallos: fallos });
}

function driveCarpetaNueva(nombre, padre) {
  if (!nombre) return salida({ ok: false, error: "Falta el nombre de la carpeta." });
  var f = carpetaPorId(padre).createFolder(nombre);
  return salida({ ok: true, archivo: fichaArchivo(f, true) });
}

function drivePapelera(ids) {
  var hechos = 0, fallos = [];
  (ids || []).forEach(function (id) {
    try { elementoPorId(id).el.setTrashed(true); hechos++; } catch (e) { fallos.push(id); }
  });
  return salida({ ok: true, enviados: hechos, fallos: fallos });
}

function driveCopiar(id, titulo) {
  var f = DriveApp.getFileById(id);
  var padre = padreDe(f);
  var copia = padre ? f.makeCopy(titulo || (f.getName() + " (copia)"), DriveApp.getFolderById(padre))
                    : f.makeCopy(titulo || (f.getName() + " (copia)"));
  return salida({ ok: true, archivo: fichaArchivo(copia, false) });
}

function driveCrear(pet) {
  if (!pet.title) return salida({ ok: false, error: "Falta el nombre del archivo." });
  var carpeta = carpetaPorId(pet.padre), f;
  if (pet.base64) {
    if (pet.base64.length > 30 * 1024 * 1024) return salida({ ok: false, error: "El archivo es demasiado grande." });
    f = carpeta.createFile(Utilities.newBlob(Utilities.base64Decode(pet.base64), pet.mimeType || "application/octet-stream", pet.title));
  } else {
    f = carpeta.createFile(pet.title, pet.texto || "", pet.mimeType || "text/plain");
  }
  return salida({ ok: true, archivo: fichaArchivo(f, false) });
}

function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function reemplazarEn(contenedor, buscar, nuevo) {
  var pat = escRe(buscar), previo = null, coincidencias = [], r;
  while ((r = previo ? contenedor.findText(pat, previo) : contenedor.findText(pat)) && coincidencias.length < 2000) {
    coincidencias.push({ t: r.getElement().asText(), s: r.getStartOffset(), e: r.getEndOffsetInclusive() });
    previo = r;
  }
  for (var i = coincidencias.length - 1; i >= 0; i--) {
    var c = coincidencias[i];
    c.t.deleteText(c.s, c.e);
    if (nuevo) c.t.insertText(c.s, nuevo);
  }
  return coincidencias.length;
}

function driveReemplazarDoc(pet) {
  var id = pet.id, pares = pet.pares || [];
  if (!pares.length) return salida({ ok: false, error: "No hay cambios que aplicar." });
  var f = DriveApp.getFileById(id);
  if (f.getMimeType() !== MIME_DOC) return salida({ ok: false, error: "Solo se pueden editar aquí los documentos de Google; los Word se editan en la app." });
  var objetivo = id, destinoFicha = null;
  if (pet.copia !== false) {
    var padre = padreDe(f);
    var copia = padre ? f.makeCopy(pet.titulo || (f.getName() + " (corregido)"), DriveApp.getFolderById(padre))
                      : f.makeCopy(pet.titulo || (f.getName() + " (corregido)"));
    objetivo = copia.getId();
    destinoFicha = fichaArchivo(copia, false);
  }
  var doc = DocumentApp.openById(objetivo), cuerpo = doc.getBody();
  var resumen = pares.map(function (p) {
    if (!p.buscar) return { buscar: "", veces: 0 };
    var n = reemplazarEn(cuerpo, p.buscar, p.reemplazar || "");
    try { n += reemplazarEn(doc.getHeader(), p.buscar, p.reemplazar || ""); } catch (e) {}
    try { n += reemplazarEn(doc.getFooter(), p.buscar, p.reemplazar || ""); } catch (e) {}
    return { buscar: p.buscar, veces: n };
  });
  doc.saveAndClose();
  return salida({ ok: true, resumen: resumen, archivo: destinoFicha });
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
