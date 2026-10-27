/**
 * Secretaría Nebrija · conexión con Google Sheets
 * ------------------------------------------------
 * Pega este código en Extensiones → Apps Script de TU hoja de cálculo
 * y despliégalo como aplicación web (ver README o la ayuda dentro de la app).
 *
 * Antes de desplegar, define la propiedad de la secuencia de comandos:
 *   Configuración del proyecto (⚙) → Propiedades de la secuencia de comandos → CLAVE = (la clave que quieras)
 *
 * La app web se ejecuta con tu cuenta y solo responde a quien envíe esa CLAVE
 * o la llave de un dispositivo vinculado.
 *
 * VINCULAR DISPOSITIVOS CON UN CÓDIGO DE 6 CIFRAS
 *   En la hoja, menú Secretaría → Nuevo código de acceso (o la propiedad PIN = 6 cifras).
 *   En cada móvil u ordenador se escribe ese código una vez y el script le da su propia llave. Tras 5 fallos seguidos el código
 *   se bloquea 15 minutos (y el doble cada vez que se repite, hasta 24 horas); los
 *   dispositivos ya vinculados siguen funcionando. Cambiar el PIN no desvincula a nadie:
 *   para desvincular todos los dispositivos, menú Secretaría → Desvincular todos los dispositivos.
 *
 * CENSO DESDE DRIVE: menú Secretaría → Elegir el listado de colegiales (Drive) guarda en
 *   CENSO_ORIGEN el id de una hoja de Google; la app lee el censo siempre de ahí (solo lectura).
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
 *
 *   Búsqueda rápida: en el editor, Servicios (+) → Drive API (v3), identificador «Drive».
 *   Sin él la búsqueda funciona igual pero más lenta y sin propietario ni tamaño.
 *
 * AUTOMATIZACIÓN (opcional): tareas que hace un navegador automático en un repositorio
 * privado de GitHub (por ejemplo, dar de alta personas en Clupik). Propiedades:
 *   GH_TOKEN    · token de GitHub limitado a ese repositorio (permiso Actions: lectura y escritura)
 *   GH_REPO     · usuario/repositorio (p. ej. robercurdia-dot/nebrija-automatizacion)
 *   CLAVE_AUTO  · una segunda clave, distinta de CLAVE, que solo sirve para que el ejecutor
 *                 recoja el encargo y devuelva el resultado (no da acceso a nada más)
 *   GH_WORKFLOW · (opcional) nombre del flujo; por defecto tarea.yml
 */
var VERSION_SCRIPT = 4;
var PIN_INTENTOS = 5;

var HOJAS = {
  censo: "Censo",
  categorias: "Categorías",
  sesiones: "Sesiones",
  asistencia: "Asistencia",
  totales: "Totales",
  auto: "Automatización"
};
var CABECERAS = {
  censo: ["Apellido 1", "Apellido 2", "Nombre", "Teléfono", "Habitación", "DNI", "Email", "Estudios"],
  categorias: ["Id", "Nombre", "Puntos", "Modificado", "Borrada"],
  sesiones: ["Id", "Fecha", "CategoríaId", "Categoría", "Título", "Modificado", "Borrada"],
  asistencia: ["SesiónId", "Fecha", "Categoría", "Título", "Clave", "Apellidos", "Nombre", "Habitación", "Estado", "Puntos"],
  auto: ["Id", "Tarea", "Estado", "Creado", "Actualizado", "Mensaje", "Encargo", "Resultado"]
};
// columnas numéricas (el resto se guarda como texto para que Sheets no convierta fechas ni números)
var NUMERICAS = {
  categorias: [3, 4],
  sesiones: [6],
  asistencia: [10],
  auto: [4, 5]
};
var ESTADO_TEXTO = { P: "Presente", A: "Ausente", J: "Justificado" };
var ESTADO_CODIGO = { "Presente": "P", "Ausente": "A", "Justificado": "J" };

function doGet() {
  return salida({ ok: true, mensaje: "Secretaría Nebrija: la conexión está activa. Abre la aplicación para usarla." });
}

function doPost(e) {
  INICIO_PETICION = Date.now(); CORTADO = false;
  var lock = LockService.getScriptLock();
  var bloqueado = false;
  try {
    var pet = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();
    if (pet.accion === "vincular") {
      lock.waitLock(25000);
      bloqueado = true;
      return vincularPin(props, pet);
    }
    var clave = props.getProperty("CLAVE");
    var claveAuto = props.getProperty("CLAVE_AUTO");
    // CLAVE es opcional: sin ella solo entran los dispositivos vinculados con el PIN
    var tokenOk = !!pet.token && ((clave && String(pet.token) === String(clave)) || esDispositivo(props, String(pet.token)));
    // El ejecutor automático usa su propia clave y solo puede tocar estas tres acciones
    var esEjecutor = !tokenOk && claveAuto && pet.token && String(pet.token) === String(claveAuto) &&
      ["auto_tomar", "auto_progreso", "auto_fin"].indexOf(pet.accion) >= 0;
    if (!tokenOk && !esEjecutor) return salida({ ok: false, error: "La clave no coincide con la del script." });
    // Las consultas que solo leen Drive no esperan a que termine una sincronización
    if (SOLO_LECTURA.indexOf(pet.accion) < 0) {
      lock.waitLock(25000);
      bloqueado = true;
    }

    switch (pet.accion) {
      case "ping":
        return salida({ ok: true, hoja: SpreadsheetApp.getActiveSpreadsheet().getName(),
                        version: VERSION_SCRIPT, drive: driveActivo(), auto: autoConfigurada() });
      case "censo_leer":
        return censoLeer();
      case "censo_escribir":
        return censoEscribir(pet.valores);
      case "todo":
        return todo();
      case "lista_guardar":
        return listaGuardar(pet);
      default:
        if (String(pet.accion).indexOf("auto_") === 0) return autoAccion(pet);
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

/* ---------------- vinculación con PIN ---------------- */

// Menú en la hoja: «Secretaría → Nuevo código de acceso» crea un PIN al azar y lo enseña solo a quien tiene la hoja abierta.
function onOpen() {
  SpreadsheetApp.getUi().createMenu("Secretaría")
    .addItem("Nuevo código de acceso", "nuevoPin")
    .addItem("Desvincular todos los dispositivos", "desvincularTodo")
    .addItem("Activar o desactivar Drive en la app", "alternarDrive")
    .addSeparator()
    .addItem("Elegir el listado de colegiales (Drive)…", "elegirCensoDrive")
    .addItem("Preparar copia de la tabla de puntos…", "prepararTablaPuntos")
    .addItem("Ver estructura de la tabla de puntos", "describirTablaPuntos")
    .addToUi();
}
function alternarDrive() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  if (driveActivo()) {
    if (ui.alert("Drive en la app", "El acceso a Drive desde la app está ACTIVADO. ¿Desactivarlo?", ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
    props.setProperty("DRIVE_ACCESO", "no");
    ui.alert("Drive desactivado: la app ya no puede ver ni tocar archivos.");
  } else {
    if (ui.alert("Drive en la app", "Cualquier dispositivo vinculado con el código podrá ver, buscar, mover, renombrar, copiar y enviar a la papelera archivos de este Drive. ¿Activarlo?", ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
    props.setProperty("DRIVE_ACCESO", "si");
    ui.alert("Drive activado. En la app: «Archivo en Drive» → Comprobar.");
  }
}
// El censo se lee siempre de un listado de Drive (propiedad CENSO_ORIGEN); el listado nunca se modifica.
function censoDeHoja(hoja) {
  var valores = hoja.getSheets()[0].getDataRange().getDisplayValues();
  var fila = -1;
  for (var i = 0; i < Math.min(valores.length, 15) && fila < 0; i++) {
    var aciertos = valores[i].filter(function (c) { return /apellido|nombre|habitaci|dni|nie|tel[eé]f|m[oó]vil|correo|email/i.test(String(c)); }).length;
    if (aciertos >= 2) fila = i;
  }
  if (fila < 0) return null;
  return valores.slice(fila).filter(function (f) { return f.some(function (c) { return String(c).trim() !== ""; }); });
}
// La tabla de puntos nunca se edita en el original: se crea una copia convertida a hoja de Google
// en la misma carpeta (propiedad PUNTOS_TABLA) y la app solo escribe en esa copia.
function prepararTablaPuntos() {
  var ui = SpreadsheetApp.getUi();
  if (typeof Drive === "undefined" || !Drive.Files) { ui.alert("Falta el servicio avanzado de Drive en el script."); return; }
  var r = ui.prompt("Tabla de puntos", "Pega el enlace de la tabla de puntos (Excel o hoja de Google). Se creará una COPIA en la misma carpeta; el original no se modifica.", ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var m = String(r.getResponseText()).match(/[-\w]{25,}/);
  if (!m) { ui.alert("No reconozco ese enlace."); return; }
  var meta;
  try { meta = Drive.Files.get(m[0], { fields: "id,name,mimeType,parents", supportsAllDrives: true }); }
  catch (e) { ui.alert("No puedo abrir ese archivo: " + e.message); return; }
  var nombre = String(meta.name).replace(/\.(xlsx|xls|csv)$/i, "") + " (copia para la app)";
  var copia = Drive.Files.copy({ name: nombre, mimeType: "application/vnd.google-apps.spreadsheet", parents: meta.parents }, meta.id, { supportsAllDrives: true });
  PropertiesService.getScriptProperties().setProperty("PUNTOS_TABLA", copia.id);
  ui.alert("Copia creada: «" + nombre + "», en la misma carpeta que el original (que no se ha tocado).\n\nAhora usa «Ver estructura de la tabla de puntos» y mándale una captura a quien te ayuda con la app.");
}
function describirTablaPuntos() {
  var ui = SpreadsheetApp.getUi();
  var id = PropertiesService.getScriptProperties().getProperty("PUNTOS_TABLA");
  if (!id) { ui.alert("Todavía no hay copia de la tabla de puntos: usa «Preparar copia de la tabla de puntos…»."); return; }
  var ss = SpreadsheetApp.openById(id), txt = "«" + ss.getName() + "»\n";
  ss.getSheets().slice(0, 6).forEach(function (h) {
    var n = Math.min(h.getLastRow(), 12), c = h.getLastColumn();
    txt += "\n▸ Pestaña «" + h.getName() + "»: " + h.getLastRow() + " filas × " + c + " columnas\n";
    if (!n || !c) return;
    var v = h.getRange(1, 1, n, c).getDisplayValues(), fila = -1;
    for (var i = 0; i < n && fila < 0; i++) if (v[i].some(function (x) { return /apellido|nombre/i.test(x); })) fila = i;
    if (fila < 0) { txt += "  (no encuentro cabeceras con Apellidos/Nombre)\n"; return; }
    txt += "  Cabeceras en la fila " + (fila + 1) + ":\n  " + v[fila].map(function (x, j) { return letraCol(j + 1) + "=" + (String(x).trim() || "·").slice(0, 22); }).join("  ") + "\n";
    if (fila + 2 <= h.getLastRow()) {
      var f = h.getRange(fila + 2, 1, 1, c).getFormulas()[0];
      var conF = f.map(function (x, j) { return x ? letraCol(j + 1) + ": " + x.slice(0, 40) : ""; }).filter(String);
      if (conF.length) txt += "  Fórmulas en la primera fila de datos: " + conF.slice(0, 6).join("  ") + "\n";
    }
  });
  ui.alert("Estructura (solo títulos, sin datos de personas)", txt.slice(0, 3500), ui.ButtonSet.OK);
}
function letraCol(n) { var s = ""; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; }
function elegirCensoDrive() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var actual = props.getProperty("CENSO_ORIGEN");
  var nombreActual = "";
  if (actual) { try { nombreActual = SpreadsheetApp.openById(actual).getName(); } catch (e) { nombreActual = "(no se puede abrir)"; } }
  var r = ui.prompt("Listado de colegiales",
    (actual ? "Ahora el censo se lee de «" + nombreActual + "».\n\n" : "") +
    "Pega el enlace de la hoja de Google de Drive con el listado de colegiales (la app lo leerá siempre de ahí; nunca lo modifica). Déjalo vacío para dejar de usarlo.",
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var texto = String(r.getResponseText()).trim();
  if (!texto) { props.deleteProperty("CENSO_ORIGEN"); ui.alert("Hecho: el censo vuelve a leerse de la pestaña «Censo» de esta hoja."); return; }
  var m = texto.match(/[-\w]{25,}/);
  if (!m) { ui.alert("No reconozco ese enlace."); return; }
  var origen;
  try { origen = SpreadsheetApp.openById(m[0]); }
  catch (e) { ui.alert("No puedo abrir esa hoja. Si es un Excel (.xlsx), ábrelo en Drive y guárdalo como hoja de Google (Archivo → Guardar como Hojas de cálculo de Google)."); return; }
  var datos = censoDeHoja(origen);
  if (!datos) { ui.alert("No encuentro una fila de cabeceras (Apellidos, Nombre, Habitación…) en la primera pestaña de «" + origen.getName() + "»."); return; }
  props.setProperty("CENSO_ORIGEN", m[0]);
  ui.alert("Listo: la app leerá el censo de «" + origen.getName() + "» (" + (datos.length - 1) + " filas). En la app, toca «Traer de mi hoja de Google».");
}
function nuevoPin() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty("PIN") && ui.alert("Código de acceso", "Ya hay un código. Si creas otro, el anterior deja de valer (los dispositivos ya vinculados siguen funcionando). ¿Crear uno nuevo?", ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid(), Utilities.Charset.UTF_8);
  var n = 0;
  for (var i = 0; i < 6; i++) n = (n * 256 + (bytes[i] & 255)) % 1000000;
  var pin = ("00000" + n).slice(-6);
  props.setProperty("PIN", pin);
  props.deleteProperty("PIN_BLOQUEO");
  ui.alert("Código de acceso", "El código para vincular dispositivos es:\n\n" + pin + "\n\nEscríbelo en la app, en «¿Eres de la Secretaría?». No lo compartas por escrito.", ui.ButtonSet.OK);
}
function desvincularTodo() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert("Desvincular", "Todos los móviles y ordenadores vinculados con el código tendrán que volver a escribirlo. ¿Seguir?", ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  PropertiesService.getScriptProperties().deleteProperty("DISPOSITIVOS");
  ui.alert("Hecho: ningún dispositivo queda vinculado con el código.");
}

function huella(texto) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8));
}
function leerJson(props, nombre) {
  try { return JSON.parse(props.getProperty(nombre) || "{}") || {}; } catch (e) { return {}; }
}
function esDispositivo(props, token) {
  if (token.length < 40) return false;
  return !!leerJson(props, "DISPOSITIVOS")[huella(token)];
}
function vincularPin(props, pet) {
  var pin = String(props.getProperty("PIN") || "").trim();
  if (!/^\d{6}$/.test(pin)) return salida({ ok: false, codigo: "pin_off",
    error: "El script no tiene código de acceso: añade la propiedad PIN con 6 cifras." });
  var ahora = Date.now();
  var b = leerJson(props, "PIN_BLOQUEO");
  if (b.hasta && ahora < b.hasta) {
    var min = Math.ceil((b.hasta - ahora) / 60000);
    return salida({ ok: false, codigo: "pin_bloqueado",
      error: "Demasiados intentos fallidos. Prueba de nuevo dentro de " + min + (min === 1 ? " minuto." : " minutos.") });
  }
  if (String(pet.pin || "") !== pin) {
    b.fallos = (b.fallos || 0) + 1;
    var quedan = PIN_INTENTOS - b.fallos;
    if (quedan <= 0) {
      b.bloqueos = (b.bloqueos || 0) + 1;
      b.hasta = ahora + Math.min(15 * Math.pow(2, b.bloqueos - 1), 1440) * 60000;
      b.fallos = 0;
    }
    props.setProperty("PIN_BLOQUEO", JSON.stringify(b));
    return salida({ ok: false, codigo: "pin_mal", error: quedan > 0
      ? (quedan === 1 ? "Código incorrecto. Te queda 1 intento." : "Código incorrecto. Te quedan " + quedan + " intentos.")
      : "Código incorrecto. Por seguridad, el acceso con código queda bloqueado un rato." });
  }
  props.deleteProperty("PIN_BLOQUEO");
  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
  var lista = leerJson(props, "DISPOSITIVOS");
  lista[huella(token)] = { nombre: String(pet.nombre || "Dispositivo").slice(0, 60), alta: new Date().toISOString().slice(0, 10) };
  props.setProperty("DISPOSITIVOS", JSON.stringify(lista));
  return salida({ ok: true, token: token, hoja: SpreadsheetApp.getActiveSpreadsheet().getName(), version: VERSION_SCRIPT });
}

/* ---------------- censo ---------------- */

function censoLeer() {
  var origen = PropertiesService.getScriptProperties().getProperty("CENSO_ORIGEN");
  if (origen) {
    var hoja;
    try { hoja = SpreadsheetApp.openById(origen); }
    catch (e) { return salida({ ok: false, error: "No se puede abrir el listado de colegiales de Drive. En la hoja, menú Secretaría → Elegir el listado de colegiales." }); }
    var datos = censoDeHoja(hoja);
    if (!datos) return salida({ ok: false, error: "El listado «" + hoja.getName() + "» no tiene una fila de cabeceras reconocible (Apellidos, Nombre, Habitación…)." });
    return salida({ ok: true, valores: datos, origen: hoja.getName() });
  }
  var h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.censo);
  if (!h) return salida({ ok: false, error: "No existe la pestaña «Censo» en la hoja. Créala con cabeceras (Apellidos, Nombre, Teléfono, Habitación, DNI…) o súbela desde la app." });
  var valores = h.getDataRange().getDisplayValues();
  return salida({ ok: true, valores: valores });
}

function censoEscribir(valores) {
  if (!valores || !valores.length) return salida({ ok: false, error: "No hay datos que escribir." });
  if (PropertiesService.getScriptProperties().getProperty("CENSO_ORIGEN"))
    return salida({ ok: false, error: "El censo se lee del listado de colegiales de Drive: haz los cambios en ese listado, no desde la app." });
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
var MAX_LISTA = 400, MAX_BUSQUEDA = 80;
var SOLO_LECTURA = ["ping", "drive_buscar", "drive_indice", "drive_listar", "drive_recientes", "drive_carpetas", "drive_leer"];
var MAX_BYTES = 20 * 1024 * 1024;

function driveActivo() {
  return String(PropertiesService.getScriptProperties().getProperty("DRIVE_ACCESO") || "").toLowerCase() === "si";
}

function driveAccion(pet) {
  switch (pet.accion) {
    case "drive_listar":      return driveListar(pet.carpeta);
    case "drive_buscar":      return driveBuscar(pet.texto, pet.tipo);
    case "drive_indice":      return driveIndice();
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
// Cada ficha son varias llamadas a Drive: se corta a los TIEMPO_DRIVE ms para que la app no espere de más
var TIEMPO_DRIVE = 20000, INICIO_PETICION = Date.now(), CORTADO = false;
function cogerHasta(iterador, esCarpeta, lista, tope) {
  while (lista.length < tope) {
    if (Date.now() - INICIO_PETICION > TIEMPO_DRIVE) { CORTADO = true; return; }
    if (!iterador.hasNext()) return;
    lista.push(fichaArchivo(iterador.next(), esCarpeta));
  }
  CORTADO = CORTADO || iterador.hasNext();
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

// Búsqueda solo por título. Con el servicio avanzado de Drive es una sola llamada (~1 s);
// si no está activado, se recorre DriveApp con un tope de 2 s y datos mínimos.
function driveBuscar(texto, tipo) {
  var t = String(texto || "").trim();
  var filtro = "";
  if (tipo === "carpeta") filtro = "mimeType = '" + MIME_CARPETA + "'";
  else if (tipo && TIPOS_BUSQUEDA[tipo]) filtro = TIPOS_BUSQUEDA[tipo];
  if (typeof Drive !== "undefined" && Drive.Files && Drive.Files.list) {
    var q = "trashed = false and mimeType != '" + MIME_ATAJO + "'" + (t ? " and name contains '" + comillas(t) + "'" : "") + (filtro ? " and (" + filtro + ")" : "");
    var r = Drive.Files.list({ q: q, pageSize: MAX_BUSQUEDA, orderBy: "folder,name",
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink,parents,owners(emailAddress))",
      supportsAllDrives: true, includeItemsFromAllDrives: true });
    var lista = (r.files || []).map(function (f) {
      return { id: f.id, title: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime, size: Number(f.size || 0),
        viewUrl: f.webViewLink || "", parentId: (f.parents || [])[0] || "", owner: ((f.owners || [])[0] || {}).emailAddress || "" };
    });
    return salida({ ok: true, archivos: ordenarFichas(lista), incompleto: !!r.nextPageToken });
  }
  var q2 = "trashed = false" + (t ? " and title contains '" + comillas(t) + "'" : "");
  var lista2 = [], fin = Date.now() + 2000;
  var it = tipo === "carpeta" ? DriveApp.searchFolders(q2)
    : DriveApp.searchFiles(q2 + " and mimeType != '" + MIME_ATAJO + "' and mimeType != '" + MIME_CARPETA + "'" + (filtro ? " and (" + filtro + ")" : ""));
  if (!tipo || tipo === "todo") {
    var itc = DriveApp.searchFolders(q2);
    while (itc.hasNext() && lista2.length < 15 && Date.now() < fin) lista2.push(fichaLigera(itc.next(), true));
  }
  while (it.hasNext() && lista2.length < 40 && Date.now() < fin) lista2.push(fichaLigera(it.next(), tipo === "carpeta"));
  return salida({ ok: true, archivos: ordenarFichas(lista2), incompleto: it.hasNext() });
}
// Índice de nombres de todo el Drive para buscar en el propio móvil sin esperar al servidor.
// Filas compactas: [id, nombre, tipo, modificado (ms), carpeta padre, tamaño].
function driveIndice() {
  if (typeof Drive === "undefined" || !Drive.Files || !Drive.Files.list) return salida({ ok: false, codigo: "sin_api", error: "Falta el servicio avanzado de Drive en el script." });
  var filas = [], token = null, tipos = [], posTipo = {};
  do {
    var r = Drive.Files.list({ q: "trashed = false and mimeType != '" + MIME_ATAJO + "'", pageSize: 1000, pageToken: token,
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime,parents,size)", supportsAllDrives: true, includeItemsFromAllDrives: true });
    (r.files || []).forEach(function (f) {
      if (!(f.mimeType in posTipo)) { posTipo[f.mimeType] = tipos.length; tipos.push(f.mimeType); }
      filas.push([f.id, f.name, posTipo[f.mimeType], Date.parse(f.modifiedTime) || 0, (f.parents || [])[0] || "", Number(f.size || 0)]);
    });
    token = r.nextPageToken;
  } while (token && filas.length < 20000 && Date.now() - INICIO_PETICION < TIEMPO_DRIVE);
  return salida({ ok: true, tipos: tipos, filas: filas, completo: !token });
}
function fichaLigera(f, esCarpeta) {
  return { id: f.getId(), title: f.getName(), mimeType: esCarpeta ? MIME_CARPETA : f.getMimeType(),
    modifiedTime: f.getLastUpdated().toISOString(), size: 0, viewUrl: f.getUrl(), parentId: "", owner: "" };
}

function driveRecientes() {
  var desde = new Date(Date.now() - 45 * 24 * 3600 * 1000);
  var q = "trashed = false and modifiedDate > '" + Utilities.formatDate(desde, "UTC", "yyyy-MM-dd") + "' and mimeType != '" + MIME_CARPETA + "'";
  var it = DriveApp.searchFiles(q), todos = [];
  while (it.hasNext() && todos.length < 300 && Date.now() - INICIO_PETICION < TIEMPO_DRIVE / 2) { var f = it.next(); todos.push({ f: f, t: f.getLastUpdated().getTime() }); }
  todos.sort(function (a, b) { return b.t - a.t; });
  var lista = [];
  for (var i = 0; i < todos.length && lista.length < 40 && Date.now() - INICIO_PETICION < TIEMPO_DRIVE; i++) lista.push(fichaArchivo(todos[i].f, false));
  return salida({ ok: true, archivos: lista });
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

/* ---------------- automatización (tareas en GitHub Actions) ---------------- */

var AUTO_MAX_CELDA = 49000;

function autoConfigurada() {
  var p = PropertiesService.getScriptProperties();
  return !!(p.getProperty("GH_TOKEN") && p.getProperty("GH_REPO") && p.getProperty("CLAVE_AUTO"));
}

function autoAccion(pet) {
  switch (pet.accion) {
    case "auto_lanzar":   return autoLanzar(pet.tarea, pet.encargo);
    case "auto_estado":   return autoEstado(pet.id);
    case "auto_lista":    return autoLista();
    case "auto_tomar":    return autoTomar(pet.id);
    case "auto_progreso": return autoProgreso(pet.id, pet.mensaje);
    case "auto_fin":      return autoFin(pet.id, pet.estado, pet.mensaje, pet.resultado);
    default:              return salida({ ok: false, error: "Acción desconocida: " + pet.accion });
  }
}

function autoFila(id) {
  var h = hoja("auto");
  var n = h.getLastRow();
  if (n < 2) return { h: h, fila: 0 };
  var ids = h.getRange(2, 1, n - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === String(id)) return { h: h, fila: i + 2 };
  return { h: h, fila: 0 };
}

function autoJson(txt) {
  try { return txt ? JSON.parse(txt) : null; } catch (e) { return null; }
}

function autoFicha(v) {
  return { id: v[0], tarea: v[1], estado: v[2], creado: Number(v[3]) || 0, actualizado: Number(v[4]) || 0, mensaje: v[5] };
}

function autoLanzar(tarea, encargo) {
  var p = PropertiesService.getScriptProperties();
  if (!autoConfigurada()) return salida({ ok: false, codigo: "auto_off",
    error: "La automatización no está configurada en el script (faltan GH_TOKEN, GH_REPO o CLAVE_AUTO)." });
  tarea = String(tarea || "");
  if (!/^[a-z0-9_-]{1,30}$/.test(tarea)) return salida({ ok: false, error: "Nombre de tarea no válido." });
  var txt = JSON.stringify(encargo === undefined ? {} : encargo);
  if (txt.length > AUTO_MAX_CELDA) return salida({ ok: false, error: "El encargo es demasiado grande (máximo unos 49 000 caracteres): divídelo en dos tandas." });

  var id = "T" + Utilities.getUuid().replace(/-/g, "").slice(0, 10);
  var ahora = Date.now();
  var h = hoja("auto");
  var fila = h.getLastRow() + 1;
  h.getRange(fila, 1, 1, 8).setNumberFormat("@");
  h.getRange(fila, 4, 1, 2).setNumberFormat("General");
  h.getRange(fila, 1, 1, 8).setValues([[id, tarea, "en_cola", ahora, ahora, "Encargo enviado, esperando al ejecutor…", txt, ""]]);

  var repo = p.getProperty("GH_REPO");
  var flujo = p.getProperty("GH_WORKFLOW") || "tarea.yml";
  var r = UrlFetchApp.fetch("https://api.github.com/repos/" + repo + "/actions/workflows/" + encodeURIComponent(flujo) + "/dispatches", {
    method: "post",
    contentType: "application/json",
    headers: {
      "Authorization": "Bearer " + p.getProperty("GH_TOKEN"),
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "secretaria-nebrija"
    },
    payload: JSON.stringify({ ref: "main", inputs: { id: id, tarea: tarea } }),
    muteHttpExceptions: true
  });
  var codigo = r.getResponseCode();
  if (codigo !== 204) {
    var msg = "GitHub no aceptó el encargo (código " + codigo + ")";
    if (codigo === 401 || codigo === 403) msg += ": revisa que el token GH_TOKEN siga vigente y tenga permiso de Actions (lectura y escritura) sobre el repositorio.";
    else if (codigo === 404) msg += ": no se encuentra el repositorio o el flujo " + flujo + " (revisa GH_REPO).";
    else if (codigo === 422) msg += ": el flujo no tiene el disparador manual o la rama main no existe.";
    h.getRange(fila, 3).setValue("error");
    h.getRange(fila, 6).setValue(msg);
    h.getRange(fila, 7).setValue("");
    return salida({ ok: false, error: msg });
  }
  return salida({ ok: true, id: id });
}

function autoEstado(id) {
  var f = autoFila(id);
  if (!f.fila) return salida({ ok: false, error: "No existe ese encargo." });
  var v = f.h.getRange(f.fila, 1, 1, 8).getValues()[0];
  var t = autoFicha(v);
  t.resultado = autoJson(v[7]);
  return salida({ ok: true, trabajo: t });
}

function autoLista() {
  var h = hoja("auto");
  var n = h.getLastRow();
  if (n < 2) return salida({ ok: true, trabajos: [] });
  var desde = Math.max(2, n - 14);
  var filas = h.getRange(desde, 1, n - desde + 1, 6).getValues().map(autoFicha).reverse();
  return salida({ ok: true, trabajos: filas });
}

function autoTomar(id) {
  var f = autoFila(id);
  if (!f.fila) return salida({ ok: false, error: "No existe ese encargo." });
  var v = f.h.getRange(f.fila, 1, 1, 8).getValues()[0];
  if (v[2] !== "en_cola") return salida({ ok: false, error: "Ese encargo ya no está en cola (estado: " + v[2] + ")." });
  f.h.getRange(f.fila, 3).setValue("ejecutando");
  f.h.getRange(f.fila, 5, 1, 2).setValues([[Date.now(), "El ejecutor ha empezado."]]);
  return salida({ ok: true, tarea: v[1], encargo: autoJson(v[6]) || {} });
}

function autoProgreso(id, mensaje) {
  var f = autoFila(id);
  if (!f.fila) return salida({ ok: false, error: "No existe ese encargo." });
  f.h.getRange(f.fila, 5, 1, 2).setValues([[Date.now(), String(mensaje || "").slice(0, 300)]]);
  return salida({ ok: true });
}

function autoFin(id, estado, mensaje, resultado) {
  var f = autoFila(id);
  if (!f.fila) return salida({ ok: false, error: "No existe ese encargo." });
  var res = JSON.stringify(resultado === undefined ? null : resultado);
  if (res.length > AUTO_MAX_CELDA) res = JSON.stringify({ truncado: true });
  var fin = estado === "ok" ? "ok" : "error";
  f.h.getRange(f.fila, 3).setValue(fin);
  f.h.getRange(f.fila, 5, 1, 2).setValues([[Date.now(), String(mensaje || "").slice(0, 300)]]);
  f.h.getRange(f.fila, 7, 1, 2).setValues([["(borrado al terminar)", res]]);
  return salida({ ok: true });
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
