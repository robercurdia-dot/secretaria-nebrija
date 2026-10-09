(function(){
"use strict";
var ESCUDO = "img/escudo.png";
var LETRAS = "TRWAGMYFPDXBNJZSQVHLCKE";
var PART = ["de","del","la","las","los","y","san","da","do"];

/* ---------- utilidades ---------- */
function sinAcentos(s){ return (s==null?"":String(s)).normalize("NFD").replace(/[̀-ͯ]/g,""); }
function norm(s){ return sinAcentos(s).toLowerCase().replace(/[^a-z0-9ñ ]/g," ").replace(/\s+/g," ").trim(); }
function toks(s){ var n=norm(s); return n?n.split(" "):[]; }
function titulo(s){
  if(!s) return "";
  return String(s).trim().split(/\s+/).map(function(w,i){
    var l=w.toLowerCase();
    if(i>0 && PART.indexOf(sinAcentos(l))>=0) return l;
    return w.split("-").map(function(p){ return p.charAt(0).toUpperCase()+p.slice(1).toLowerCase(); }).join("-");
  }).join(" ");
}
function txt(v){ if(v==null) return ""; if(typeof v==="number") return Number.isInteger(v)?String(v):String(v); return String(v).trim(); }
function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){ return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]; }); }

function docInfo(d){
  var s=(d||"").toUpperCase().replace(/[\s-]/g,"");
  if(!s) return {tipo:"", estado:"falta"};
  var m=s.match(/^(\d{8})([A-Z])$/);
  if(m) return {tipo:"DNI", estado: LETRAS[parseInt(m[1],10)%23]===m[2] ? "ok":"letra"};
  var n=s.match(/^([XYZ])(\d{7})([A-Z])$/);
  if(n){ var num=String("XYZ".indexOf(n[1]))+n[2];
    return {tipo:"NIE", estado: LETRAS[parseInt(num,10)%23]===n[3] ? "ok":"letra"}; }
  return {tipo:"Otro", estado:"otro"};
}
function habKey(h){
  var m=String(h||"").trim().match(/^(\d+)\s*(.*)$/);
  return m ? [parseInt(m[1],10), m[2]] : [99999, String(h||"")];
}

var F_NOM = "clara carla rebeca adriana lara idoia marina natalia jenifer laura marta olivia martina julia sofia claudia lucia ana maria alexia celia carolina valentina aldara olga emma paulina sara sandra silvia irene uxue blanca elsa sonia mencia alejandra julie marilou nuria beatriz lorena vera carmen johanna ines paula saleta daniela aurora elena eva raquel rocio pilar teresa isabel patricia".split(" ");
var M_NOM = "raul mario sebastian vladimir rodrigo alvaro roberto roque david carlos adrian amir fernando pablo martin tomas pedro daniel alberto miguel juan jesus ramon arturo jacobo alejandro javier iker jaime anxo diego manuel antonio francisco gonzalo telmo jon lucas enrique jan julio bo guillermo ignacio ruben oscar nicolas luis marcos sergio hector jorge andres pau".split(" ");
function genero(nombre){
  var p=norm(nombre).split(" ")[0]||"";
  if(F_NOM.indexOf(p)>=0) return "F";
  if(M_NOM.indexOf(p)>=0) return "M";
  return /a$/.test(p) ? "F" : "M";
}

/* ---------- estado ---------- */
var CLAVE="nebrija-secretaria-v1";
var CENSO=[];
function listaVacia(){ return { categorias:[], sesiones:[], actual:null, borradas:[], catBorradas:[], ultSync:0 }; }
var S={ censo:[], origen:"vacio", puntos:[], puntosLista:false, generoManual:{}, sel:{}, anuario:{}, enviados:{}, salidos:[], clupik:[],
        lista:listaVacia(), ajustes:{ campos:{}, sheets:{ url:"", token:"", auto:true } } };

var guardarTimer=null;
function guardar(){
  try{ localStorage.setItem(CLAVE, JSON.stringify({censo:S.censo, origen:S.origen, puntos:S.puntos, puntosLista:S.puntosLista,
    generoManual:S.generoManual, anuario:S.anuario, enviados:S.enviados, salidos:SORTEO.salidos, clupik:S.clupik,
    lista:S.lista, ajustes:S.ajustes})); }catch(e){}
}
function cargar(){
  try{
    var raw=localStorage.getItem(CLAVE);
    if(!raw) return false;
    var d=JSON.parse(raw);
    if(!d) return false;
    S.censo=d.censo||[]; S.origen=d.origen||(S.censo.length?"fichero":"vacio"); S.puntos=d.puntos||[]; S.puntosLista=!!d.puntosLista;
    S.generoManual=d.generoManual||{}; S.anuario=d.anuario||{}; S.enviados=d.enviados||{}; SORTEO.salidos=d.salidos||[];
    S.clupik=(d.clupik||[]).map(function(p){
      if(p.modalidad===undefined) p.modalidad="baloncesto";
      if(p.genero===undefined) p.genero=p.equipo||"M";
      delete p.equipo;
      return p;
    });
    var l=d.lista||{}, base=listaVacia();
    Object.keys(base).forEach(function(k){ S.lista[k]= l[k]!==undefined ? l[k] : base[k]; });
    var aj=d.ajustes||{};
    S.ajustes.campos=aj.campos||{};
    S.ajustes.sheets=Object.assign({url:"",token:"",auto:true}, aj.sheets||{});
    return true;
  }catch(e){}
  return false;
}

/* ---------- avisos flotantes (toast) ---------- */
function toast(msg, tipo){
  var wrap=document.getElementById("toast-wrap");
  if(!wrap){ wrap=document.createElement("div"); wrap.id="toast-wrap"; document.body.appendChild(wrap); }
  var t=document.createElement("div");
  t.className="toast"+(tipo==="mal"?" mal":"");
  t.textContent=msg;
  while(wrap.children.length>=2) wrap.removeChild(wrap.firstChild);
  wrap.appendChild(t);
  t.addEventListener("click", function(){ t.remove(); });
  setTimeout(function(){ t.remove(); }, tipo==="mal" ? 6000 : 3600);
}

/* ---------- lectura de ficheros ---------- */
var MAPA=[
  ["a1", ["apellido1","apellido 1","primer apellido","apellidos","apellido"]],
  ["a2", ["apellido2","apellido 2","segundo apellido"]],
  ["nom",["nombre"]],
  ["tel",["telefono","tlf movil","telefono movil","movil","numero de telefono"]],
  ["hab",["habitacion","n habitacion","num habitac","numero de habitacion","cuarto"]],
  ["dni",["dni","documento","nif","nie"]],
  ["email",["email","e mail","correo","correo electronico"]],
  ["estudios",["estudios","titulacion","carrera","estudios que estas cursando actualmente"]],
  ["puntos",["total","puntos","total puntos"]]
];
function claveCol(cab, yaApellido){
  var c=norm(cab);
  for(var i=0;i<MAPA.length;i++){
    var campo=MAPA[i][0], alias=MAPA[i][1];
    for(var j=0;j<alias.length;j++){
      if(c===alias[j] || c.indexOf(alias[j])===0){
        if(campo==="a1" && yaApellido) return "a2";
        return campo;
      }
    }
  }
  return null;
}
function filasDeHoja(filas){
  if(!filas.length) return [];
  var cab=filas[0].map(function(x){return txt(x);});
  var cols=[], vistoAp=false;
  cab.forEach(function(c){ var k=claveCol(c, vistoAp); if(k==="a1") vistoAp=true; if(k==="a2") vistoAp=true; cols.push(k); });
  if(cols.filter(Boolean).length<2) return [];
  var out=[];
  for(var r=1;r<filas.length;r++){
    var o={a1:"",a2:"",nom:"",tel:"",hab:"",dni:"",email:"",estudios:"",puntos:""};
    var algo=false;
    for(var c=0;c<cols.length;c++){
      if(!cols[c]) continue;
      var v=txt(filas[r][c]);
      if(v==="( vacío )") v="";
      if(v){ o[cols[c]]=v; algo=true; }
    }
    if(algo && (o.a1||o.nom)) out.push(o);
  }
  return out;
}
function leer(file){
  return new Promise(function(res,rej){
    var fr=new FileReader();
    fr.onerror=function(){ rej(new Error("No se ha podido leer "+file.name)); };
    fr.onload=function(e){
      try{
        if(typeof XLSX==="undefined"){ rej(new Error("la librería de hojas de cálculo no ha cargado; recarga la página")); return; }
        var wb=XLSX.read(new Uint8Array(e.target.result),{type:"array"});
        var mejor=[];
        wb.SheetNames.forEach(function(n){
          var filas=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:false,defval:""});
          var p=filasDeHoja(filas);
          if(p.length>mejor.length) mejor=p;
        });
        res(mejor);
      }catch(err){ rej(err); }
    };
    fr.readAsArrayBuffer(file);
  });
}
function soltar(zona, input, cb, multiple){
  zona.addEventListener("dragover", function(e){ e.preventDefault(); zona.classList.add("hot"); });
  zona.addEventListener("dragleave", function(){ zona.classList.remove("hot"); });
  zona.addEventListener("drop", function(e){
    e.preventDefault(); zona.classList.remove("hot");
    var fs=Array.prototype.slice.call(e.dataTransfer.files);
    if(fs.length) cb(multiple?fs:[fs[0]]);
  });
  zona.addEventListener("click", function(e){ if(e.target.tagName!=="INPUT" && !e.target.closest("button")) input.click(); });
  input.addEventListener("change", function(){
    var fs=Array.prototype.slice.call(input.files);
    if(fs.length) cb(multiple?fs:[fs[0]]);
    input.value="";
  });
}

/* ---------- render: censo ---------- */
function nombreCompleto(p){ return [titulo(p.nom), titulo(p.a1), titulo(p.a2)].filter(Boolean).join(" "); }
function apellidos(p){ return [titulo(p.a1), titulo(p.a2)].filter(Boolean).join(" "); }

function etiquetaOrigen(){
  if(!S.censo.length) return ["Sin censo","demo"];
  if(S.origen==="ejemplo") return ["Datos de ejemplo","demo"];
  return ["Datos cargados","real"];
}
function pintarEstado(){
  var e=document.getElementById("estado");
  var eo=etiquetaOrigen();
  e.innerHTML =
    '<span class="chip '+eo[1]+'"><span class="punto"></span>'+eo[0]+'</span>'+
    '<span class="chip"><b>'+S.censo.length+'</b>&nbsp;colegiales</span>';
}
function tarjetasCenso(){
  var n=S.censo.length;
  var conDni=S.censo.filter(function(p){ return docInfo(p.dni).estado==="ok"; }).length;
  var conTel=S.censo.filter(function(p){ return p.tel; }).length;
  var conHab=S.censo.filter(function(p){ return p.hab; }).length;
  document.getElementById("tarjetas-censo").innerHTML=[
    tarjeta("Colegiales", n, "en el censo", ""),
    tarjeta("Documento válido", conDni, n-conDni ? (n-conDni)+" por revisar" : "todos comprobados", conDni===n?"ok":"av"),
    tarjeta("Con teléfono", conTel, n-conTel ? "faltan "+(n-conTel) : "completo", conTel===n?"ok":""),
    tarjeta("Con habitación", conHab, n-conHab ? "faltan "+(n-conHab) : "completo", conHab===n?"ok":"")
  ].join("");
}
function pintarResumen(){
  var el=document.getElementById("resumen-estado");
  if(!el) return;
  var eo=etiquetaOrigen();
  el.innerHTML='<span class="chip '+eo[1]+'"><span class="punto"></span>'+eo[0]+'</span>';
  var iv=document.getElementById("inicio-vacio"); if(iv) iv.hidden = S.censo.length>0;
  document.getElementById("tarjetas-resumen").hidden = !S.censo.length;

  var n=S.censo.length;
  var conDni=S.censo.filter(function(p){ return docInfo(p.dni).estado==="ok"; }).length;
  var anuListos=S.censo.filter(anuCompleto).length;
  var conf=S.clupik.filter(function(p){ return p.estado==="confirmada"; }).length;
  var totalHab=0, ocupHab=0;
  PLANO.forEach(function(pab){ pab.plantas.forEach(function(pl){ pl.filas.forEach(function(fila){ fila.forEach(function(cel){
    if(!cel || cel==="|" || cel.aula) return;
    totalHab++;
    var num=numHab(cel.n);
    if(num && ocupantes(num).length) ocupHab++;
  }); }); }); });

  document.getElementById("tarjetas-resumen").innerHTML=[
    tarjeta("Colegiales", n, "en el censo", ""),
    tarjeta("Documento válido", conDni+" / "+n, n-conDni ? (n-conDni)+" por revisar" : "todos comprobados", conDni===n?"ok":"av"),
    tarjeta("Habitaciones ocupadas", ocupHab+" / "+totalHab, "colegio y anexos", ""),
    tarjeta("Anuario listo", anuListos+" / "+n, n-anuListos ? "faltan "+(n-anuListos) : "completo", anuListos===n?"ok":""),
    tarjeta("Altas Clupik", S.clupik.length, S.clupik.length ? (conf+" confirmadas") : "ninguna preparada todavía", "")
  ].join("");
}
function tarjeta(k,v,n,cls){
  return '<div class="tarjeta '+(cls||"")+'"><div class="k">'+esc(k)+'</div><div class="v">'+esc(v)+'</div><div class="n">'+esc(n)+'</div></div>';
}
function filtrado(q){
  if(!q) return S.censo;
  var n=norm(q);
  return S.censo.filter(function(p){
    return norm([p.a1,p.a2,p.nom,p.hab,p.dni,p.tel].join(" ")).indexOf(n)>=0;
  });
}
function pintarCenso(){
  pintarEstado(); tarjetasCenso();
  var q=document.getElementById("busca").value;
  var datos=filtrado(q);
  var h='<thead><tr><th class="num">#</th><th>Apellidos</th><th>Nombre</th><th>Teléfono</th><th>Habitación</th><th>DNI</th></tr></thead><tbody>';
  datos.forEach(function(p,i){
    var d=docInfo(p.dni);
    h+='<tr><td class="num" style="color:var(--ink-faint)">'+(i+1)+'</td>'+
       '<td><strong>'+esc(apellidos(p))+'</strong></td><td>'+esc(titulo(p.nom))+'</td>'+
       '<td class="mono">'+(p.tel?esc(p.tel):'<span class="vacio">—</span>')+'</td>'+
       '<td class="hab">'+(p.hab?esc(p.hab):'<span class="vacio">—</span>')+'</td>'+
       '<td class="mono">'+(p.dni?esc(p.dni):'<span class="vacio">—</span>')+
       (d.estado==="letra"?' <span class="pill mal">letra</span>':'')+'</td></tr>';
  });
  if(!datos.length) h+='<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--ink-faint)">'+(S.censo.length?('Sin resultados para «'+esc(q)+'»'):'Todavía no hay colegiales. Carga un Excel, trae el censo de tu hoja de Google o prueba con los datos de ejemplo.')+'</td></tr>';
  var zt=document.getElementById("zona-censo-t"), zd=document.getElementById("zona-censo-d");
  if(zt){
    zt.textContent = S.censo.length ? "Censo cargado: "+S.censo.length+" colegiales" : "Carga el censo";
    zd.textContent = S.censo.length ? "Suelta aquí otro Excel o CSV para sustituirlo, o vuelve a traerlo de tu hoja de Google." : "Arrastra aquí un Excel o CSV (en el móvil, pulsa para elegirlo) con apellidos, nombre, teléfono, habitación, DNI…";
  }
  document.getElementById("tabla-censo").innerHTML=h+"</tbody>";
  pintarHabitaciones(); pintarValidacion(); pintarCertLista(); pintarPuntos(); pintarAnuario(); pintarMensajes(); pintarPlano(); pintarSorteo(); pintarResumen(); pintarLista();
}

/* ---------- unificar ---------- */
function claveP(p){ return norm([p.a1,p.a2,p.nom].join(" ")).split(" ").sort().join(" "); }
function unificar(listas){
  var todos=[], fuentes=[];
  listas.forEach(function(l,i){ fuentes.push(l.nombre+" · "+l.filas.length); l.filas.forEach(function(f){ f.__f=i; todos.push(f); }); });
  var vistos={}, unico=[], dups=0;
  todos.forEach(function(p){
    var k=claveP(p);
    if(vistos[k]){ dups++; var ex=vistos[k];
      ["tel","hab","dni","email","estudios","puntos"].forEach(function(c){ if(!ex[c] && p[c]) ex[c]=p[c]; });
    } else { vistos[k]=p; unico.push(p); }
  });
  var parecidos=[];
  for(var i=0;i<unico.length;i++) for(var j=i+1;j<unico.length;j++){
    var a=unico[i], b=unico[j];
    if(norm(a.nom)===norm(b.nom) && norm(a.a1)===norm(b.a1) && norm(a.a2)!==norm(b.a2))
      parecidos.push([a,b]);
  }
  unico.sort(function(a,b){ return norm(a.a1+" "+a.a2+" "+a.nom).localeCompare(norm(b.a1+" "+b.a2+" "+b.nom),"es"); });
  return {unico:unico, dups:dups, parecidos:parecidos, fuentes:fuentes};
}
var ULTIMO_UNI=null;
function renderUnificado(r){
  var h='<div class="tarjetas">'+
    tarjeta("Ficheros", r.fuentes.length, r.fuentes.join(" · "),"")+
    tarjeta("Censo unificado", r.unico.length, "sin repetidos","ok")+
    tarjeta("Repetidos", r.dups, "fusionados automáticamente","")+
    tarjeta("Casos a revisar", r.parecidos.length, "mismo nombre, distinto apellido", r.parecidos.length?"av":"")+
    '</div>';
  if(r.parecidos.length){
    h+='<div class="aviso rojo"><span class="punto" style="margin-top:7px"></span><div><b>Revisa estos casos:</b> '+
       r.parecidos.map(function(par){ return esc(nombreCompleto(par[0]))+" / "+esc(nombreCompleto(par[1])); }).join(" · ")+
       '. Se han mantenido como personas distintas.</div></div>';
  }
  h+='<div class="barra"><button class="btn p" id="btn-usar-uni">Usar como censo</button></div>'+
     '<div class="caja"><div class="tablawrap"><table class="cards"><thead><tr><th>Apellidos</th><th>Nombre</th><th>Teléfono</th><th>Habitación</th><th>DNI</th></tr></thead><tbody>'+
     r.unico.map(function(p){ return '<tr><td><strong>'+esc(apellidos(p))+'</strong></td><td>'+esc(titulo(p.nom))+'</td><td class="mono">'+esc(p.tel||"—")+'</td><td class="hab">'+esc(p.hab||"—")+'</td><td class="mono">'+esc(p.dni||"—")+'</td></tr>'; }).join("")+
     '</tbody></table></div></div>';
  return h;
}

/* ---------- validación ---------- */
function pintarValidacion(){
  var problemas=[], contDni=0;
  var porDoc={};
  S.censo.forEach(function(p){
    var d=docInfo(p.dni);
    if(d.estado==="ok") contDni++;
    if(d.estado==="falta") problemas.push([p,"Sin documento","mal"]);
    else if(d.estado==="letra") problemas.push([p,"Letra de control incorrecta","mal"]);
    else if(d.estado==="otro") problemas.push([p,"Formato no estándar (pasaporte)","av"]);
    if(p.dni){ var k=p.dni.toUpperCase().replace(/\s/g,""); (porDoc[k]=porDoc[k]||[]).push(p); }
    if(!p.tel) problemas.push([p,"Sin teléfono","av"]);
    if(!p.hab) problemas.push([p,"Sin habitación","av"]);
    if(p.tel && /^\d{8}[A-Za-z]$/.test(p.tel.replace(/\s/g,""))) problemas.push([p,"El teléfono contiene un DNI","mal"]);
  });
  Object.keys(porDoc).forEach(function(k){
    if(porDoc[k].length>1) porDoc[k].forEach(function(p){ problemas.push([p,"Documento repetido","mal"]); });
  });
  var graves=problemas.filter(function(x){ return x[2]==="mal"; }).length;
  document.getElementById("tarjetas-val").innerHTML=[
    tarjeta("Documentos válidos", contDni+" / "+S.censo.length, "letra de control comprobada", contDni===S.censo.length?"ok":""),
    tarjeta("Errores", graves, graves?"requieren corrección":"ninguno", graves?"av":"ok"),
    tarjeta("Avisos", problemas.length-graves, "datos incompletos", "")
  ].join("");

  var c=document.getElementById("res-val");
  if(!problemas.length){
    c.innerHTML='<div class="aviso"><span class="pill ok">Todo correcto</span><div>El censo no presenta errores ni fichas incompletas.</div></div>';
    return;
  }
  var h='<div class="caja"><div class="tablawrap"><table class="cards"><thead><tr><th>Colegial</th><th>Habitación</th><th>Incidencia</th></tr></thead><tbody>';
  problemas.sort(function(a,b){ return (a[2]==="mal"?0:1)-(b[2]==="mal"?0:1); });
  problemas.forEach(function(x){
    h+='<tr><td><strong>'+esc(apellidos(x[0]))+'</strong>, '+esc(titulo(x[0].nom))+'</td>'+
       '<td class="hab">'+esc(x[0].hab||"—")+'</td>'+
       '<td><span class="pill '+x[2]+'">'+esc(x[1])+'</span></td></tr>';
  });
  c.innerHTML=h+'</tbody></table></div></div>';
}

/* ---------- habitaciones ---------- */
function porHabitacion(){
  return S.censo.slice().sort(function(a,b){
    var ka=habKey(a.hab), kb=habKey(b.hab);
    return ka[0]-kb[0] || String(ka[1]).localeCompare(String(kb[1]));
  });
}
function pintarHabitaciones(){
  var d=porHabitacion();
  var cuenta={};
  d.forEach(function(p){ if(p.hab){ var k=habKey(p.hab)[0]; cuenta[k]=(cuenta[k]||0)+1; } });
  var dobles=Object.keys(cuenta).filter(function(k){ return cuenta[k]>1; });
  var ocupadas=Object.keys(cuenta).length;
  document.getElementById("tarjetas-hab").innerHTML=[
    tarjeta("Habitaciones ocupadas", ocupadas, "con al menos un colegial",""),
    tarjeta("Compartidas", dobles.length, dobles.length?("nº "+dobles.slice(0,6).join(", ")+(dobles.length>6?"…":"")):"ninguna",""),
    tarjeta("Sin asignar", S.censo.filter(function(p){return !p.hab;}).length, "colegiales", "")
  ].join("");

  var h='<thead><tr><th class="num">Hab.</th><th>Apellidos</th><th>Nombre</th><th>Teléfono</th><th>DNI</th></tr></thead><tbody>';
  d.forEach(function(p){
    var comp = p.hab && cuenta[habKey(p.hab)[0]]>1;
    h+='<tr><td class="num hab">'+esc(p.hab||"—")+(comp?' <span class="pill neutro">doble</span>':'')+'</td>'+
       '<td><strong>'+esc(apellidos(p))+'</strong></td><td>'+esc(titulo(p.nom))+'</td>'+
       '<td class="mono">'+esc(p.tel||"—")+'</td><td class="mono">'+esc(p.dni||"—")+'</td></tr>';
  });
  document.getElementById("tabla-hab").innerHTML=h+"</tbody>";
}

/* ---------- plano del Colegio ---------- */
var PLANO=[
  { pabellon:"Pabellón Moncloa", plantas:[
    { nombre:"3ª", filas:[
      [{n:"93 D",w:2},{n:"96 I"},{n:"98*"},{n:"100"},"|",{n:"104"},{n:"102*"},{n:"106 I"},{n:"108 D",w:2}],
      [{n:"92*"},{n:"94"},{n:"95 I"},{n:"97*"},{n:"99"},"|",{n:"101"},{n:"103*"},{n:"105 I"},{n:"107"},{n:"109*"}]
    ]},
    { nombre:"2ª", filas:[
      [{n:"75 D",w:2,nota:"Subdirector"},{n:"77"},{n:"80*"},{n:"82"},"|",{n:"84"},{n:"86*"},{n:"88 I"},{n:"90 D",w:2}],
      [{n:"76"},{n:"74"},{n:"78 I"},{n:"79*"},{n:"81"},"|",{n:"83"},{n:"85*"},{n:"87 I"},{n:"89"},{n:"91*"}]
    ]},
    { nombre:"1ª", filas:[
      [{n:"57 D",w:2},{n:"60 I"},{n:"62*"},{n:"64"},"|",{n:"66"},{n:"68*"},{n:"70 I"},{n:"72 D",w:2}],
      [{n:"56*"},{n:"58"},{n:"59 I"},{n:"61*"},{n:"63"},"|",{n:"65"},{n:"67*"},{n:"69 I"},{n:"71"},{n:"73*"}]
    ]},
    { nombre:"Baja", filas:[
      [{n:"41 D",w:2},{n:"43 I"},{n:"45*"},{n:"47"},"|",{n:"49"},{n:"51*"},{n:"53 I"},{n:"55 D",w:2}],
      [null,{n:"40"},{n:"42*"},{n:"44*"},{n:"46"},"|",{n:"48"},{n:"50*"},{n:"52*"},{n:"54*"},null]
    ]}
  ]},
  { pabellon:"Pabellón Argüelles", plantas:[
    { nombre:"3ª", filas:[[{n:"30*"},{n:"31"},{n:"32*"},{n:"33*"},{n:"34"},"|",{n:"35"},{n:"36*"},{n:"37*"},{n:"38"},{n:"39*"}]]},
    { nombre:"2ª", filas:[[{n:"20*"},{n:"21"},{n:"22*"},{n:"23*"},{n:"24"},"|",{n:"25"},{n:"26*"},{n:"27*"},{n:"28"},{n:"29*"}]]},
    { nombre:"1ª", filas:[[{n:"10*"},{n:"11"},{n:"12*"},{n:"13*"},{n:"14"},"|",{n:"15"},{n:"16*"},{n:"17*"},{n:"18"},{n:"19*"}]]},
    { nombre:"Baja", filas:[[{n:"1"},{n:"2"},{n:"3*"},{n:"4*"},{n:"5"},"|",{n:"6"},{n:"7*"},{n:"8*"},{n:"9",aula:true},null]]}
  ]}
];
var PLANO_SEL=null;

function numHab(txt){ var m=String(txt||"").match(/^\s*(\d+)/); return m? +m[1] : null; }
function ocupantes(num){
  return S.censo.filter(function(p){ return habKey(p.hab)[0]===num; });
}
function claseHab(cel, gente){
  var modo=document.getElementById("plano-color").value;
  if(cel.aula) return "aula";
  if(modo==="tipo") return /D$/.test(cel.n.trim()) ? "doble" : (/\*$/.test(cel.n) ? "asterisco" : "normal");
  if(modo==="datos"){
    if(!gente.length) return "libre";
    var mal=gente.some(function(p){ return faltaSecretaria(p).length>0; });
    return mal ? "incompleta" : "completa";
  }
  return gente.length ? (gente.length>1 ? "compartida" : "ocupada") : "libre";
}
function pintarPlano(){
  var q=norm(document.getElementById("plano-busca").value||"");
  var lienzo=document.getElementById("plano-lienzo");
  var total=0, ocupadas=0, plazas=0;
  var h="";
  PLANO.forEach(function(pab){
    h+='<div class="pab"><h2>'+esc(pab.pabellon)+'</h2>';
    pab.plantas.forEach(function(pl){
      h+='<div class="planta"><div class="planta-et">'+esc(pl.nombre)+'</div><div class="planta-filas">';
      pl.filas.forEach(function(fila){
        h+='<div class="fila">';
        fila.forEach(function(cel){
          if(cel==="|"){ h+='<div class="hueco-centro"></div>'; return; }
          if(!cel){ h+='<div class="cuarto vacio"></div>'; return; }
          var num=numHab(cel.n), gente=num? ocupantes(num):[];
          if(!cel.aula){ total++; plazas+=gente.length; if(gente.length) ocupadas++; }
          var marca = q && gente.some(function(p){ return norm([p.a1,p.a2,p.nom].join(" ")).indexOf(q)>=0; });
          h+='<div class="cuarto '+claseHab(cel,gente)+(marca?" marcado":"")+
             (PLANO_SEL===cel.n?" activo":"")+'" data-hab="'+esc(cel.n)+'" tabindex="0" role="button"'+
             (cel.w?' style="grid-column:span '+cel.w+'"':'')+'>'+
             '<span class="num">'+esc(cel.n)+'</span>'+
             (cel.nota?'<span class="nota-hab">'+esc(cel.nota)+'</span>':'')+
             (cel.aula? '<span class="quien">Aula de estudios</span>'
               : gente.length
                 ? gente.map(function(p){ return '<span class="quien" draggable="true" data-idx="'+S.censo.indexOf(p)+'">'+esc(titulo(p.nom))+' '+esc(titulo(p.a1))+'</span>'; }).join("")
                 : '<span class="quien libre">libre</span>')+
             '</div>';
        });
        h+='</div>';
      });
      h+='</div></div>';
    });
    h+='</div>';
  });
  lienzo.innerHTML=h;
  document.getElementById("plano-estado").innerHTML=
    '<span class="chip real"><span class="punto"></span>'+ocupadas+' de '+total+' habitaciones ocupadas</span>'+
    '<span class="chip"><b>'+plazas+'</b>&nbsp;colegiales situados</span>';
}
function fichaHab(nombreHab){
  PLANO_SEL=nombreHab;
  var num=numHab(nombreHab), gente=num? ocupantes(num):[];
  var h='<div class="panel" style="margin-top:16px"><h3>Habitación '+esc(nombreHab)+'</h3>';
  if(!gente.length){
    h+='<p style="color:var(--ink-soft); font-size:13.5px">Sin colegial asignado en el censo.</p>';
  } else {
    gente.forEach(function(p){
      var falta=faltaSecretaria(p);
      h+='<div style="padding:10px 0; border-bottom:1px solid var(--linea)">'+
         '<div style="font-family:Spectral,serif; font-size:17px">'+esc(nombreCompleto(p))+'</div>'+
         '<div style="font-size:13px; color:var(--ink-soft); margin-top:3px">'+
         (p.estudios? esc(p.estudios)+' · ':'')+'<span class="mono">'+esc(p.tel||"sin teléfono")+'</span>'+
         (p.dni? ' · <span class="mono">'+esc(p.dni)+'</span>':'')+'</div>'+
         (p.email? '<div style="font-size:12.5px; color:var(--ink-faint)">'+esc(p.email)+'</div>':'')+
         (falta.length? '<div style="margin-top:5px"><span class="pill av">falta '+esc(falta.join(", "))+'</span></div>':'')+
         '<div class="barra" style="margin:8px 0 0">'+
         (telefonoWa(p.tel)? '<button class="btn" data-wa-plano="'+S.censo.indexOf(p)+'">Escribir por WhatsApp</button>':'')+
         '<button class="btn" data-cert-plano="'+S.censo.indexOf(p)+'">Certificado de residencia</button>'+
         '</div>'+
         '<div class="barra" style="margin:8px 0 0"><input class="busca" type="text" inputmode="numeric" placeholder="Pasar a la habitación nº…" data-mover-in="'+S.censo.indexOf(p)+'" style="max-width:190px">'+
         '<button class="btn" data-mover="'+S.censo.indexOf(p)+'">Mover</button></div></div>';
    });
  }
  h+='</div>';
  var viejo=document.getElementById("plano-ficha");
  if(viejo) viejo.remove();
  var d=document.createElement("div"); d.id="plano-ficha"; d.innerHTML=h;
  document.getElementById("plano-lienzo").insertAdjacentElement("afterend", d);
  pintarPlano();
}
function impPlano(){
  var h=cabeceraImp("Plano de habitaciones · curso 2026-27", S.censo.length+" colegiales");
  PLANO.forEach(function(pab){
    h+='<h3 style="font-family:Spectral,serif;color:#A81C24;margin:6mm 0 2mm">'+esc(pab.pabellon)+'</h3>';
    h+='<table><thead><tr><th>Planta</th><th>Habitación</th><th>Colegial</th></tr></thead><tbody>';
    pab.plantas.forEach(function(pl){
      pl.filas.forEach(function(fila){
        fila.forEach(function(cel){
          if(!cel || cel==="|" || cel.aula) return;
          var num=numHab(cel.n), gente=num? ocupantes(num):[];
          h+='<tr><td>'+esc(pl.nombre)+'</td><td><strong>'+esc(cel.n)+'</strong></td><td>'+
             (gente.length? gente.map(function(p){ return esc(nombreCompleto(p)); }).join(" · ") : "—")+'</td></tr>';
        });
      });
    });
    h+='</tbody></table>';
  });
  imprimir(h);
}

/* ---------- certificados ---------- */
function generoDe(p){
  var k=claveP(p);
  return S.generoManual[k] || genero(p.nom);
}
function pintarCertLista(){
  var cont=document.getElementById("cert-lista");
  if(!cont) return;
  var q=norm(document.getElementById("cert-busca").value||"");
  var h="";
  S.censo.forEach(function(p,i){
    if(q && norm([p.a1,p.a2,p.nom].join(" ")).indexOf(q)<0) return;
    var g=generoDe(p);
    h+='<label class="fila-sel"><input type="checkbox" data-i="'+i+'" '+(S.sel[i]!==false?"checked":"")+'>'+
       '<span><strong>'+esc(apellidos(p))+'</strong>, '+esc(titulo(p.nom))+'</span>'+
       '<button class="gen" data-g="'+i+'" title="Cambiar concordancia">'+(g==="F"?"la colegial":"el colegial")+'</button></label>';
  });
  cont.innerHTML=h||'<div style="padding:16px;color:var(--ink-faint)">Sin resultados</div>';
  var n=S.censo.filter(function(_,i){ return S.sel[i]!==false; }).length;
  document.getElementById("cert-nota").textContent=n+" certificado"+(n===1?"":"s")+" · una página por colegial";
}

/* ---------- puntos ---------- */
function creditos(t){ var n=Number(t)||0; if(n>25) return 3; if(n>=20) return 2; if(n>=10) return 1; return 0; }
function datosPuntos(){
  if(S.puntosLista) return puntosDeLista();
  if(S.puntos.length) return S.puntos;
  return S.censo.filter(function(p){ return p.puntos!=="" && p.puntos!=null; });
}
function pintarPuntos(){
  var d=datosPuntos().slice().sort(function(a,b){ return (Number(b.puntos)||0)-(Number(a.puntos)||0); });
  var tot=d.length;
  var sin=d.filter(function(p){ return creditos(p.puntos)===0; }).length;
  var media=tot? (d.reduce(function(s,p){ return s+(Number(p.puntos)||0); },0)/tot) : 0;
  document.getElementById("tarjetas-pts").innerHTML=[
    tarjeta("Con puntos registrados", tot, "de "+S.censo.length+" colegiales", ""),
    tarjeta("Media de puntos", media.toFixed(1), "del curso", ""),
    tarjeta("Sin créditos", sin, sin?"por debajo de 10 puntos":"nadie por debajo", sin?"av":"ok"),
    tarjeta("Con 3 créditos", d.filter(function(p){ return creditos(p.puntos)===3; }).length, "más de 25 puntos", "ok")
  ].join("");

  var h='<thead><tr><th class="num">#</th><th>Apellidos</th><th>Nombre</th><th class="num">Puntos</th><th class="num">Créditos</th><th>Estado</th></tr></thead><tbody>';
  d.forEach(function(p,i){
    var c=creditos(p.puntos);
    h+='<tr><td class="num" style="color:var(--ink-faint)">'+(i+1)+'</td>'+
       '<td><strong>'+esc(apellidos(p))+'</strong></td><td>'+esc(titulo(p.nom))+'</td>'+
       '<td class="num mono">'+esc(p.puntos)+'</td><td class="num mono"><strong>'+c+'</strong></td>'+
       '<td>'+(c===0?'<span class="pill mal">no cumple</span>':(c===3?'<span class="pill ok">máximo</span>':'<span class="pill neutro">'+c+' crédito'+(c>1?"s":"")+'</span>'))+'</td></tr>';
  });
  if(!d.length) h+='<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--ink-faint)">Arrastra la tabla de puntos para calcular los créditos</td></tr>';
  document.getElementById("tabla-pts").innerHTML=h+"</tbody>";
}

/* ---------- anuario ---------- */
var ANU_CAMPOS=[["foto","Foto"],["aut","Autorización"],["texto","Texto"]];
function anuDe(p){
  var k=claveP(p);
  if(!S.anuario[k]) S.anuario[k]={foto:false,aut:false,texto:false};
  return S.anuario[k];
}
function anuCompleto(p){ var a=anuDe(p); return a.foto && a.aut && a.texto; }
function anuPendientesDe(p){
  var a=anuDe(p);
  return ANU_CAMPOS.filter(function(c){ return !a[c[0]]; }).map(function(c){ return c[1]; });
}
function pintarAnuario(){
  var cont=document.getElementById("tabla-anu");
  if(!cont) return;
  var n=S.censo.length;
  var conFoto=S.censo.filter(function(p){ return anuDe(p).foto; }).length;
  var conAut=S.censo.filter(function(p){ return anuDe(p).aut; }).length;
  var conTexto=S.censo.filter(function(p){ return anuDe(p).texto; }).length;
  var listos=S.censo.filter(anuCompleto).length;
  document.getElementById("tarjetas-anu").innerHTML=[
    tarjeta("Fotos recibidas", conFoto+" / "+n, n-conFoto?("faltan "+(n-conFoto)):"completo", conFoto===n?"ok":"av"),
    tarjeta("Autorizaciones", conAut+" / "+n, n-conAut?("faltan "+(n-conAut)):"completo", conAut===n?"ok":"av"),
    tarjeta("Textos", conTexto+" / "+n, n-conTexto?("faltan "+(n-conTexto)):"completo", conTexto===n?"ok":""),
    tarjeta("Fichas completas", listos, "listas para maquetar", listos===n?"ok":"")
  ].join("");

  var q=norm(document.getElementById("anu-busca").value||"");
  var filtro=document.getElementById("anu-filtro").value;
  var h='<thead><tr><th>Apellidos</th><th>Nombre</th><th>Habitación</th><th>Foto</th><th>Autorización</th><th>Texto</th><th>Estado</th></tr></thead><tbody>';
  var vistos=0;
  S.censo.forEach(function(p,i){
    if(q && norm([p.a1,p.a2,p.nom].join(" ")).indexOf(q)<0) return;
    var ok=anuCompleto(p);
    if(filtro==="pendientes" && ok) return;
    if(filtro==="listos" && !ok) return;
    vistos++;
    var a=anuDe(p), falta=anuPendientesDe(p).length;
    h+='<tr><td><strong>'+esc(apellidos(p))+'</strong></td><td>'+esc(titulo(p.nom))+'</td>'+
       '<td class="hab">'+esc(p.hab||"—")+'</td>'+
       ANU_CAMPOS.map(function(c){
         return '<td><button class="marca-tog" data-anu="'+i+'" data-campo="'+c[0]+'" data-on="'+(a[c[0]]?1:0)+'">'+
                (a[c[0]]?"recibida":"pendiente")+'</button></td>';
       }).join("")+
       '<td>'+(ok?'<span class="pill ok">completa</span>':'<span class="pill av">'+falta+' pendiente'+(falta>1?"s":"")+'</span>')+'</td></tr>';
  });
  if(!vistos) h+='<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--ink-faint)">Sin colegiales en este filtro</td></tr>';
  cont.innerHTML=h+"</tbody>";
}
function impPendientes(){
  var pend=S.censo.filter(function(p){ return !anuCompleto(p); });
  var h=cabeceraImp("Anuario · material pendiente", pend.length+" de "+S.censo.length+" colegiales");
  if(!pend.length){
    h+='<p style="font-size:11pt">No falta nada: las '+S.censo.length+' fichas están completas.</p>';
  } else {
    h+='<table><thead><tr><th>Apellidos</th><th>Nombre</th><th>Habitación</th><th>Falta</th></tr></thead><tbody>';
    pend.forEach(function(p){
      h+='<tr><td><strong>'+esc(apellidos(p))+'</strong></td><td>'+esc(titulo(p.nom))+'</td>'+
         '<td>'+esc(p.hab||"—")+'</td><td>'+esc(anuPendientesDe(p).join(", "))+'</td></tr>';
    });
    h+='</tbody></table>';
  }
  imprimir(h);
}
function impOrla(){
  var h=cabeceraImp("Orla del curso", S.censo.length+" colegiales")+'<div class="orla">';
  S.censo.forEach(function(p){
    h+='<div class="ficha"><div class="hueco"></div><div class="n">'+esc(titulo(p.nom))+'</div>'+
       '<div class="n" style="font-weight:600">'+esc(apellidos(p))+'</div>'+
       '<div class="h">Hab. '+esc(p.hab||"—")+'</div></div>';
  });
  imprimir(h+'</div>');
}

/* ---------- sorteos ---------- */
var SORTEO={ salidos:[], girando:false, ultimo:null };
var ALTURA=62;
function azar(n){
  if(window.crypto && crypto.getRandomValues){
    var a=new Uint32Array(1); crypto.getRandomValues(a);
    return a[0] % n;
  }
  return Math.floor(Math.random()*n);
}
function participantes(){
  var g=document.getElementById("sorteo-grupo").value;
  return S.censo.filter(function(p){
    if(g==="moncloa") return pabellon(p)==="Moncloa";
    if(g==="arguelles") return pabellon(p)==="Argüelles";
    if(g==="dobles"){
      var n=habKey(p.hab)[0];
      return S.censo.filter(function(q){ return habKey(q.hab)[0]===n; }).length>1;
    }
    return true;
  });
}
function bombo(){
  var todos=participantes();
  if(!document.getElementById("sorteo-sinrep").checked) return todos;
  return todos.filter(function(p){ return SORTEO.salidos.indexOf(claveP(p))<0; });
}
function filaBombo(p, premiado){
  return '<div class="bombo-nombre'+(premiado?" premiado":"")+'">'+esc(nombreCompleto(p))+
         '<small>Habitación '+esc(p.hab||"—")+'</small></div>';
}
function pintarSorteo(){
  var dentro=bombo();
  document.getElementById("sorteo-estado").innerHTML=
    '<span class="chip real"><span class="punto"></span>'+dentro.length+' en el bombo</span>'+
    (SORTEO.salidos.length? '<span class="chip"><b>'+SORTEO.salidos.length+'</b>&nbsp;ya han salido</span>' : '');
  document.getElementById("sorteo-bombo").textContent=
    dentro.length+" colegiales entran en este sorteo"+(SORTEO.salidos.length? ", "+SORTEO.salidos.length+" excluidos por haber salido ya." : ".");

  var hist=document.getElementById("sorteo-historial");
  if(!SORTEO.salidos.length){
    hist.innerHTML='<div style="padding:14px; color:var(--ink-faint); font-size:13px">Todavía no ha salido nadie.</div>';
  } else {
    hist.innerHTML=SORTEO.salidos.map(function(k,i){
      var p=S.censo.filter(function(x){ return claveP(x)===k; })[0];
      return '<div class="fila-sel"><span style="min-width:20px; color:var(--ink-faint); font-size:12px">'+(i+1)+'</span>'+
             '<span><strong>'+esc(p? nombreCompleto(p) : k)+'</strong>'+
             (p? '<span style="color:var(--ink-faint)"> · hab. '+esc(p.hab||"—")+'</span>':'')+'</span></div>';
    }).join("");
  }
  if(!SORTEO.girando && !SORTEO.ultimo){
    var muestra=dentro.length? dentro : S.censo;
    var cinta=document.getElementById("bombo-cinta");
    cinta.style.transition="none"; cinta.style.transform="translateY(0)";
    cinta.innerHTML = muestra.length
      ? [0,1,2].map(function(i){ return filaBombo(muestra[azar(muestra.length)], false); }).join("")
      : '<div class="bombo-nombre">Carga primero el censo</div>';
  }
}
function girar(){
  if(SORTEO.girando) return;
  var dentro=bombo();
  if(!dentro.length){ toast("No queda nadie en el bombo. Quita el filtro o empieza de cero."); return; }
  var ganador=dentro[azar(dentro.length)];
  SORTEO.girando=true; SORTEO.ultimo=null;
  var caja=document.querySelector(".bombo");
  caja.classList.remove("ganador");
  document.getElementById("sorteo-girar").disabled=true;
  document.getElementById("sorteo-otra").hidden=true;
  document.getElementById("sorteo-nota").textContent="Girando…";

  var relleno=[], total=participantes();
  var vueltas = 34 + azar(10);
  for(var i=0;i<vueltas;i++) relleno.push(total[azar(total.length)]);
  var cinta=document.getElementById("bombo-cinta");
  cinta.style.transition="none";
  cinta.style.transform="translateY(0)";
  cinta.innerHTML = relleno.map(function(p){ return filaBombo(p,false); }).join("")
    + filaBombo(ganador,true)
    + [0,1].map(function(){ return filaBombo(total[azar(total.length)],false); }).join("");

  var destino = (relleno.length - 1) * ALTURA;   // el premiado queda en la ventana central
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  requestAnimationFrame(function(){
    requestAnimationFrame(function(){
      cinta.style.transition = reduce ? "none" : "transform 4.4s cubic-bezier(.08,.72,.12,1)";
      cinta.style.transform = "translateY(-"+destino+"px)";
      if(reduce) terminar(ganador, caja);
    });
  });
  if(!reduce){
    var fin=function(){ cinta.removeEventListener("transitionend", fin); terminar(ganador, caja); };
    cinta.addEventListener("transitionend", fin);
    setTimeout(function(){ if(SORTEO.girando) fin(); }, 5200);
  }
}
function terminar(ganador, caja){
  SORTEO.girando=false; SORTEO.ultimo=ganador;
  caja.classList.add("ganador");
  document.getElementById("sorteo-girar").disabled=false;
  document.getElementById("sorteo-otra").hidden=false;
  document.getElementById("sorteo-nota").innerHTML='<strong style="color:var(--carmin); font-size:15px">'+
    esc(nombreCompleto(ganador))+'</strong> · habitación '+esc(ganador.hab||"—");
  if(SORTEO.salidos.indexOf(claveP(ganador))<0) SORTEO.salidos.push(claveP(ganador));
  guardar(); pintarSorteo();
}

/* ---------- mensajes de WhatsApp ---------- */
var PLANTILLAS={
  foto:"Hola {nombre}, soy de secretaría del Colegio Mayor Nebrija.\n\nPara el anuario de este curso nos falta tu {pendiente}. ¿Nos lo puedes pasar esta semana?\n\nGracias.",
  datos:"Hola {nombre}, soy de secretaría del Colegio.\n\nEstamos cerrando el listado del curso y nos falta algún dato tuyo ({falta}). ¿Nos lo confirmas?\n\nGracias.",
  puntos:"Hola {nombre}, te escribo por la participación colegial.\n\nAhora mismo llevas {puntos} puntos, que son {creditos} créditos. Aún estás a tiempo de sumar en clubes y actividades culturales.\n\nCualquier duda, dime.",
  acto:"Hola {nombre}, recordatorio del Colegio Mayor Nebrija.\n\nMañana tenemos acto en el salón de actos. Se pasa lista para los puntos de participación.\n\n¡Te esperamos!",
  libre:"Hola {nombre},\n\n"
};
var VARIABLES=[["{nombre}","nombre"],["{apellidos}","apellidos"],["{habitacion}","habitación"],
               ["{pendiente}","lo que falta del anuario"],["{falta}","datos que faltan"],
               ["{puntos}","puntos"],["{creditos}","créditos"]];

function telefonoWa(t){
  var s=String(t||"").replace(/[^\d+]/g,"");
  if(!s) return "";
  if(s.charAt(0)==="+") s=s.slice(1);
  if(s.length===9 && /^[679]/.test(s)) s="34"+s;
  if(s.length<9) return "";
  return s;
}
function faltaSecretaria(p){
  var f=[];
  if(!p.tel) f.push("teléfono");
  if(!p.email) f.push("correo");
  if(!p.dni || docInfo(p.dni).estado!=="ok") f.push("DNI");
  if(!p.estudios) f.push("estudios");
  return f;
}
function pabellon(p){
  var n=habKey(p.hab)[0];
  if(n>=1 && n<=39) return "Argüelles";
  if(n>=40 && n<=109) return "Moncloa";
  return "";
}
function publico(){
  var f=document.getElementById("msg-publico").value;
  return S.censo.filter(function(p){
    if(f==="anuario") return !anuCompleto(p);
    if(f==="datos") return faltaSecretaria(p).length>0;
    if(f==="sincreditos"){ var pt=ptsDe(p); return pt!=="" && pt!=null && creditos(pt)===0; }
    if(f==="moncloa") return pabellon(p)==="Moncloa";
    if(f==="arguelles") return pabellon(p)==="Argüelles";
    return true;
  });
}
function mensajePara(p){
  var t=document.getElementById("msg-texto").value;
  var pend=anuPendientesDe(p).join(" y ").toLowerCase() || "material";
  var falta=faltaSecretaria(p).join(", ") || "algún dato";
  return t.replace(/\{nombre\}/g, titulo(p.nom).split(" ")[0])
          .replace(/\{apellidos\}/g, apellidos(p))
          .replace(/\{habitacion\}/g, p.hab||"—")
          .replace(/\{pendiente\}/g, pend)
          .replace(/\{falta\}/g, falta)
          .replace(/\{puntos\}/g, ptsDe(p)!==""&&ptsDe(p)!=null ? ptsDe(p) : "0")
          .replace(/\{creditos\}/g, String(creditos(ptsDe(p))));
}
function abrirWhatsApp(p){
  var tel=telefonoWa(p.tel);
  if(!tel){ toast("No hay un teléfono válido para "+nombreCompleto(p)+"."); return; }
  var url="https://wa.me/"+tel+"?text="+encodeURIComponent(mensajePara(p));
  var v=window.open(url, "_blank", "noopener");
  S.enviados[claveP(p)]=true;
  guardar(); pintarMensajes();
  if(!v){
    var a=document.createElement("a");
    a.href=url; a.target="_blank"; a.rel="noopener"; a.textContent="Abrir el chat de "+titulo(p.nom);
    a.className="btn"; a.style.textDecoration="none"; a.style.display="inline-block"; a.style.marginTop="8px";
    var c=document.getElementById("msg-tarjetas");
    c.insertAdjacentElement("afterend", a);
    setTimeout(function(){ a.remove(); }, 20000);
  }
}
function pintarMensajes(){
  var lista=document.getElementById("msg-lista");
  if(!lista) return;
  var d=publico();
  var conTel=d.filter(function(p){ return telefonoWa(p.tel); });
  var enviados=d.filter(function(p){ return S.enviados[claveP(p)]; }).length;
  document.getElementById("msg-tarjetas").innerHTML=[
    tarjeta("Destinatarios", d.length, conTel.length<d.length ? (d.length-conTel.length)+" sin teléfono válido" : "todos con teléfono", conTel.length<d.length?"av":""),
    tarjeta("Enviados", enviados+" / "+d.length, enviados===d.length&&d.length?"tanda completa":"quedan "+(d.length-enviados), enviados===d.length&&d.length?"ok":"")
  ].join("");

  var h="";
  d.forEach(function(p,i){
    var tel=telefonoWa(p.tel), hecho=S.enviados[claveP(p)];
    h+='<div class="fila-sel">'+
       '<span style="min-width:14px;color:var(--ink-faint);font-size:11.5px">'+(i+1)+'</span>'+
       '<span><strong>'+esc(titulo(p.nom))+'</strong> '+esc(apellidos(p))+
       '<span style="color:var(--ink-faint)"> · hab. '+esc(p.hab||"—")+'</span></span>'+
       '<span class="gen" style="margin-left:auto; display:flex; gap:6px; align-items:center; border:0; padding:0">'+
       (hecho?'<span class="pill ok">enviado</span>':'')+
       (tel? '<a class="marca-tog" href="https://wa.me/'+tel+'?text='+encodeURIComponent(mensajePara(p))+
             '" target="_blank" rel="noopener" data-wa="'+S.censo.indexOf(p)+'" style="text-decoration:none">abrir chat</a>'
           : '<span class="pill mal">sin teléfono</span>')+
       '</span></div>';
  });
  lista.innerHTML=h||'<div style="padding:16px;color:var(--ink-faint)">No hay nadie en este grupo</div>';

  var primero=d.filter(function(p){ return !S.enviados[claveP(p)]; })[0] || d[0];
  document.getElementById("msg-previa").textContent = primero ? mensajePara(primero) : "Sin destinatarios";
}

/* ---------- impresión ---------- */
function cabeceraImp(titulo2, contador){
  return '<div class="p-cab"><img src="'+ESCUDO+'" alt=""><div><h2>'+esc(titulo2)+'</h2>'+
         '<div class="s">Colegio Mayor Antonio de Nebrija</div></div>'+
         '<div class="c">'+esc(contador)+'</div></div>';
}
function imprimir(html){
  var z=document.getElementById("imprimible");
  z.innerHTML=html;
  window.print();
}
function impCenso(){
  var d=filtrado(document.getElementById("busca").value);
  var h=cabeceraImp("Listado de colegiales", d.length+" colegiales");
  h+='<table><thead><tr><th>Hab.</th><th>Apellidos</th><th>Nombre</th><th>Teléfono</th><th>DNI</th></tr></thead><tbody>';
  d.forEach(function(p){ h+='<tr><td>'+esc(p.hab)+'</td><td><strong>'+esc(apellidos(p))+'</strong></td><td>'+esc(titulo(p.nom))+'</td><td>'+esc(p.tel)+'</td><td>'+esc(p.dni)+'</td></tr>'; });
  imprimir(h+'</tbody></table>');
}
function impHab(){
  var d=porHabitacion();
  var h=cabeceraImp("Colegiales por habitación", d.length+" colegiales");
  h+='<table><thead><tr><th>Habitación</th><th>Apellidos</th><th>Nombre</th><th>Teléfono</th><th>DNI</th></tr></thead><tbody>';
  d.forEach(function(p){ h+='<tr><td><strong>'+esc(p.hab)+'</strong></td><td>'+esc(apellidos(p))+'</td><td>'+esc(titulo(p.nom))+'</td><td>'+esc(p.tel)+'</td><td>'+esc(p.dni)+'</td></tr>'; });
  imprimir(h+'</tbody></table>');
}
function impCertificados(){
  var dir=document.getElementById("cert-dir").value.trim();
  var cargo=document.getElementById("cert-cargo").value.trim();
  var curso=document.getElementById("cert-curso").value.trim();
  var fecha=document.getElementById("cert-fecha").value.trim();
  var elegidos=S.censo.filter(function(_,i){ return S.sel[i]!==false; });
  if(!elegidos.length){ toast("Selecciona al menos un colegial."); return; }
  if(!dir){ toast("Escribe primero el nombre de quien firma el certificado."); return; }
  if(!fecha){ toast("Escribe la fecha que irá en el certificado."); return; }
  var h="";
  elegidos.forEach(function(p){
    var art = generoDe(p)==="F" ? "la colegial" : "el colegial";
    var doc = p.dni ? esc(p.dni) : "________";
    h+='<div class="cert">'+
       '<div class="lh">Colegio Mayor Universitario<br>Antonio de Nebrija<small>Avda. Séneca, 8. 28040 Madrid</small></div>'+
       '<img src="'+ESCUDO+'" alt="">'+
       '<p>'+esc(dir)+', '+esc(cargo.replace(/^La /,"Directora").replace(/^El /,"Director"))+' del Colegio Mayor Universitario Antonio de Nebrija,</p>'+
       '<p class="hc">HACE CONSTAR:</p>'+
       '<p class="cuerpo">Que '+art+' '+esc(nombreCompleto(p))+', con DNI '+doc+', reside durante el curso '+esc(curso)+
       ' en el Colegio Mayor Universitario Antonio de Nebrija (Ciudad Universitaria, Avenida Séneca nº 8, 28040 Madrid) donde goza de una plaza. '+
       'Así lo hago constar a todos los efectos a instancia del interesado.</p>'+
       '<p class="fecha">Madrid, a '+esc(fecha)+'</p>'+
       '<p class="firma">'+esc(cargo)+'<br>'+esc(dir)+'</p></div>';
  });
  imprimir(h);
}
function impCartel(){
  if(typeof QRCode==="undefined"){ toast("El generador de códigos QR no ha cargado. Recarga la página e inténtalo de nuevo."); return; }
  var url=document.getElementById("q-url").value.trim();
  var caja=document.createElement("div");
  new QRCode(caja,{text:url||" ", width:520, height:520, correctLevel:QRCode.CorrectLevel.H});
  var t1=document.getElementById("q-t1").value, t2=document.getElementById("q-t2").value, t3=document.getElementById("q-t3").value;
  var h='<div class="p-cartel"><div class="sup"><img src="'+ESCUDO+'" alt=""><div>'+
        '<div class="k">Colegio Mayor Antonio de Nebrija</div>'+
        '<h2>'+esc(t1)+'<br>'+esc(t2)+' <span>'+esc(t3)+'</span></h2></div></div>'+
        '<div class="qrbox">'+caja.innerHTML+'</div>'+
        '<div class="pie">'+esc(document.getElementById("q-pie").value)+
        '<small>Escanea con la cámara de tu móvil</small></div></div>';
  imprimir(h);
}
function impPuntos(){
  var d=datosPuntos().slice().sort(function(a,b){ return (Number(b.puntos)||0)-(Number(a.puntos)||0); });
  var h=cabeceraImp("Puntos y créditos de participación", d.length+" colegiales");
  h+='<table><thead><tr><th>Apellidos</th><th>Nombre</th><th>Puntos</th><th>Créditos</th></tr></thead><tbody>';
  d.forEach(function(p){ h+='<tr><td><strong>'+esc(apellidos(p))+'</strong></td><td>'+esc(titulo(p.nom))+'</td><td>'+esc(p.puntos)+'</td><td>'+creditos(p.puntos)+'</td></tr>'; });
  imprimir(h+'</tbody></table>');
}

/* ---------- copiar ---------- */
function copiar(filas, btn){
  var tsv=filas.map(function(f){ return f.join("\t"); }).join("\n");
  var ok=function(){ var t=btn.textContent; btn.textContent="Copiado ✓"; setTimeout(function(){ btn.textContent=t; },1600); };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(tsv).then(ok, function(){ fallback(tsv, ok); });
  } else fallback(tsv, ok);
}
function fallback(tsv, ok){
  var ta=document.createElement("textarea"); ta.value=tsv; ta.style.position="fixed"; ta.style.opacity="0";
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand("copy"); ok(); }catch(e){}
  document.body.removeChild(ta);
}

/* ---------- carteles: preview ---------- */
var qrPrevia=null;
function actualizarCartel(){
  document.getElementById("pv-h").innerHTML=esc(document.getElementById("q-t1").value)+"<br>"+
    esc(document.getElementById("q-t2").value)+' <span id="pv-h3">'+esc(document.getElementById("q-t3").value)+"</span>";
  document.getElementById("pv-pie").textContent=document.getElementById("q-pie").value;
  var cont=document.getElementById("pv-qr");
  cont.innerHTML="";
  if(typeof QRCode==="undefined"){
    cont.innerHTML='<div style="font-size:10px;color:#A81C24;padding:12%;text-align:center">El generador de códigos no ha cargado. Recarga la página.</div>';
    return;
  }
  var url=document.getElementById("q-url").value.trim();
  qrPrevia=new QRCode(cont,{text:url||" ", width:300, height:300, correctLevel:QRCode.CorrectLevel.H});
}
var PRESETS={
  bienvenida:{t1:"Bienvenidos",t2:"al curso",t3:"2026-27",pie:"Escanear para rellenar formulario de bienvenida",url:""},
  whatsapp:{t1:"Bienvenidos",t2:"al curso",t3:"2026-27",pie:"Enlace para entrar al grupo de WhatsApp",url:""},
  libre:{t1:"Colegio Mayor",t2:"Antonio de",t3:"Nebrija",pie:"Escanea el código",url:"https://"}
};

/* ---------- clubes: inscripción en Clupik ---------- */
var CLUPIK_TEMP="2026-2027", CLUPIK_TIPO="Deportista";
function clupikEmail(){ var i=document.getElementById("clupik-email"); return (i&&i.value.trim()) || "(correo fijo sin configurar)"; }
var CLUPIK_MODALIDADES=[
  {id:"baloncesto", label:"Baloncesto", disciplina:"Baloncesto", club:"CMU Antonio de Nebrija"},
  {id:"futsalA", label:"Futsal A", disciplina:"Futsal", club:"CMU Antonio de Nebrija A"},
  {id:"futsalB", label:"Futsal B", disciplina:"Futsal", club:"CMU Antonio de Nebrija B"},
  {id:"rugby", label:"Rugby", disciplina:"Rugby", club:"CMU Antonio de Nebrija"},
  {id:"voleibolA", label:"Vóleibol A", disciplina:"Vóleibol", club:"CMU Antonio de Nebrija A"},
  {id:"voleibolB", label:"Vóleibol B", disciplina:"Vóleibol", club:"CMU Antonio de Nebrija B"},
  {id:"futbol11", label:"Fútbol 11", disciplina:"Fútbol 11", club:"CMU Antonio de Nebrija"},
  {id:"balonmano", label:"Balonmano", disciplina:"Balonmano", club:"CMU Antonio de Nebrija"}
];
function clupikModalidad(p){
  return CLUPIK_MODALIDADES.filter(function(m){ return m.id===p.modalidad; })[0] || CLUPIK_MODALIDADES[0];
}
var CLUPIK_ESTADOS=[
  ["pendiente","Pendiente de comprobar"],
  ["nueva","Perfil nuevo (crear ficha)"],
  ["existente_sin","Existe, sin licencia (crear licencia)"],
  ["existente_con","Ya tiene licencia esta temporada"],
  ["confirmada","Confirmada en Clupik ✓"]
];
function clupikEtiqueta(cod){ var e=CLUPIK_ESTADOS.filter(function(x){ return x[0]===cod; })[0]; return e?e[1]:cod; }
function clupikRegla(p){
  if(p.estado==="nueva") return "Email: "+clupikEmail()+" · Teléfono en blanco";
  if(p.estado==="existente_con") return "Ya inscrito — no crear otra licencia";
  if(p.estado==="confirmada") return "Alta ya confirmada";
  return "No tocar el correo ni el teléfono del perfil";
}
function clupikFicha(p){
  var m=clupikModalidad(p);
  return "Nombre: "+titulo(p.nom)+"\nApellidos: "+titulo(p.a1)+(p.a2?" "+titulo(p.a2):"")+
    "\nDocumento: "+(p.dni||"—")+"\nFecha de nacimiento: "+(p.fnac||"—")+
    "\nModalidad: "+m.disciplina+" "+(p.genero==="F"?"femenino":"masculino")+
    "\nRuta en Clupik: "+clupikEtiqueta(p.estado)+
    "\nRegla: "+clupikRegla(p)+
    "\nClub: "+m.club+" · Disciplina: "+m.disciplina+" · Temporada: "+CLUPIK_TEMP+" · Tipo: "+CLUPIK_TIPO+
    (p.notas?"\nNotas: "+p.notas:"");
}
function clupikFilasDeTexto(texto){
  return texto.split("\n").map(function(l){ return l.trim(); }).filter(Boolean).map(function(l){
    return { a1:"", a2:"", nom:l, dni:"", fnac:"", tel:"", notas:"" };
  });
}
function pintarClupik(){
  var d=S.clupik;
  var conf=d.filter(function(p){ return p.estado==="confirmada"; }).length;
  document.getElementById("tarjetas-clupik").innerHTML=[
    tarjeta("En la lista", d.length, "jugadores/as", ""),
    tarjeta("Pendientes", d.filter(function(p){ return p.estado==="pendiente"; }).length, "por comprobar en Clupik", ""),
    tarjeta("Perfil nuevo", d.filter(function(p){ return p.estado==="nueva"; }).length, "correo fijado automáticamente", ""),
    tarjeta("Confirmadas", conf, "de "+d.length, d.length&&conf===d.length?"ok":"av")
  ].join("");
  var h='<thead><tr><th class="num">#</th><th>Apellido 1</th><th>Apellido 2</th><th>Nombre</th><th>Documento</th><th>Fecha nac.</th><th>Club / disciplina</th><th>Género</th><th>Estado en Clupik</th><th>Regla aplicada</th><th>Notas</th><th></th></tr></thead><tbody>';
  d.forEach(function(p,i){
    h+='<tr data-i="'+i+'">'+
      '<td class="num" style="color:var(--ink-faint)">'+(i+1)+'</td>'+
      '<td><input class="cbo-in" data-f="a1" value="'+esc(p.a1)+'"></td>'+
      '<td><input class="cbo-in" data-f="a2" value="'+esc(p.a2)+'"></td>'+
      '<td><input class="cbo-in" data-f="nom" value="'+esc(p.nom)+'"></td>'+
      '<td><input class="cbo-in mono" data-f="dni" value="'+esc(p.dni)+'"></td>'+
      '<td><input class="cbo-in mono" data-f="fnac" placeholder="dd/mm/aaaa" value="'+esc(p.fnac)+'"></td>'+
      '<td><select class="cbo-in" data-f="modalidad">'+CLUPIK_MODALIDADES.map(function(m){ return '<option value="'+m.id+'"'+(p.modalidad===m.id?" selected":"")+'>'+m.label+'</option>'; }).join("")+'</select></td>'+
      '<td><select class="cbo-in" data-f="genero">'+
        '<option value="M"'+(p.genero==="F"?"":" selected")+'>Masculino</option>'+
        '<option value="F"'+(p.genero==="F"?" selected":"")+'>Femenino</option></select></td>'+
      '<td><select class="cbo-in" data-f="estado">'+CLUPIK_ESTADOS.map(function(e){ return '<option value="'+e[0]+'"'+(p.estado===e[0]?" selected":"")+'>'+e[1]+'</option>'; }).join("")+'</select></td>'+
      '<td style="font-size:11.5px; color:var(--ink-soft); max-width:190px">'+esc(clupikRegla(p))+'</td>'+
      '<td><input class="cbo-in" data-f="notas" value="'+esc(p.notas)+'"></td>'+
      '<td style="white-space:nowrap"><button class="gen" data-accion="copiar" type="button">Copiar</button> <button class="gen" data-accion="borrar" type="button">✕</button></td>'+
      '</tr>';
  });
  if(!d.length) h+='<tr><td colspan="12" style="padding:24px;text-align:center;color:var(--ink-faint)">Sube una foto de la ficha, pega la lista a mano o añade una fila en blanco</td></tr>';
  document.getElementById("tabla-clupik").innerHTML=h+"</tbody>";
  pintarResumen();
}

/* ---------- arranque ---------- */
function cerrarMenu(){ document.body.classList.remove("menu-abierto"); }
function vista(id){
  if(!document.getElementById("v-"+id)) id="resumen";
  document.querySelectorAll(".vista").forEach(function(s){ s.classList.toggle("on", s.id==="v-"+id); });
  document.querySelectorAll(".nav, #tabbar button[data-v]").forEach(function(b){ b.setAttribute("aria-current", String(b.dataset.v===id)); });
  var nb=document.querySelector('.nav[data-v="'+id+'"]');
  var tt=document.getElementById("topbar-t"); if(tt && nb) tt.textContent=nb.textContent.trim();
  cerrarMenu();
  window.scrollTo(0,0);
  try{ history.replaceState(null,"","#"+id); }catch(e){}
  if(id==="lista") pintarLista();
}
document.querySelectorAll(".nav").forEach(function(b){ b.addEventListener("click", function(){ vista(b.dataset.v); }); });
document.querySelectorAll("#tabbar button[data-v]").forEach(function(b){ b.addEventListener("click", function(){ vista(b.dataset.v); }); });
window.addEventListener("hashchange", function(){
  var h=(location.hash||"").replace("#","");
  if(h && document.getElementById("v-"+h) && !document.getElementById("v-"+h).classList.contains("on")) vista(h);
});
document.getElementById("btn-menu").addEventListener("click", function(){ document.body.classList.toggle("menu-abierto"); });
document.getElementById("tab-mas").addEventListener("click", function(){ document.body.classList.toggle("menu-abierto"); });
document.getElementById("velo").addEventListener("click", cerrarMenu);
document.addEventListener("keydown", function(e){ if(e.key==="Escape") cerrarMenu(); });
window.addEventListener("resize", function(){ if(window.innerWidth>860) cerrarMenu(); });
document.getElementById("v-resumen").addEventListener("click", function(e){
  var c=e.target.closest("button[data-ir-censo]");
  if(c){ accionCenso(c.dataset.irCenso); return; }
  var b=e.target.closest("button[data-ir]"); if(!b) return;
  vista(b.dataset.ir);
});

document.getElementById("btn-tema").addEventListener("click", function(){
  var r=document.documentElement;
  var oscuro = r.getAttribute("data-theme")==="dark" ||
    (!r.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
  var nuevo = oscuro?"light":"dark";
  r.setAttribute("data-theme", nuevo);
  try{ localStorage.setItem("nebrija-tema", nuevo); }catch(e){}
});
document.getElementById("btn-borrar").addEventListener("click", function(){
  if(!confirm("Se borrarán de este dispositivo el censo, la asistencia, los clubes y los ajustes (también la conexión con la hoja). Lo que tengas guardado en tu hoja de Google no se toca. ¿Continuar?")) return;
  try{ localStorage.removeItem(CLAVE); }catch(e){}
  S.censo=[]; S.origen="vacio"; S.puntos=[]; S.puntosLista=false; S.generoManual={}; S.sel={}; S.anuario={}; S.enviados={};
  S.clupik=[]; SORTEO.salidos=[]; SORTEO.ultimo=null; S.lista=listaVacia();
  S.ajustes={ campos:{}, sheets:{ url:"", token:"", auto:true } };
  restaurarCampos(); pintarCenso(); pintarClupik(); actualizarCartel();
  toast("Datos borrados de este dispositivo.");
});

/* campos que recuerdan su valor (firma del certificado, curso, correo de clubes…) */
function restaurarCampos(){
  document.querySelectorAll("input.persist").forEach(function(i){
    var v=S.ajustes.campos[i.id];
    i.value = v!==undefined ? v : i.defaultValue;
  });
  var pre=document.getElementById("q-preset").value, u=S.ajustes.campos["q-url:"+pre];
  document.getElementById("q-url").value = u!==undefined ? u : PRESETS[pre].url;
}
document.addEventListener("input", function(e){
  var t=e.target;
  if(t.classList && t.classList.contains("persist")){ S.ajustes.campos[t.id]=t.value; guardar(); }
  if(t.id==="q-url"){ S.ajustes.campos["q-url:"+document.getElementById("q-preset").value]=t.value; guardar(); }
});

/* instalación como aplicación */
var instalarEv=null;
window.addEventListener("beforeinstallprompt", function(e){
  e.preventDefault(); instalarEv=e;
  document.getElementById("btn-instalar").hidden=false;
});
document.getElementById("btn-instalar").addEventListener("click", function(){
  if(!instalarEv) return;
  instalarEv.prompt();
  instalarEv.userChoice.then(function(){ instalarEv=null; document.getElementById("btn-instalar").hidden=true; });
});
window.addEventListener("appinstalled", function(){ document.getElementById("btn-instalar").hidden=true; });

/* tablas que se vuelven tarjetas en el móvil: etiqueta cada celda con su cabecera */
function etiquetarTablas(){
  document.querySelectorAll("table.cards").forEach(function(t){
    var ths=[].map.call(t.querySelectorAll("thead th"), function(th){ return th.textContent.trim(); });
    t.querySelectorAll("tbody tr").forEach(function(tr){
      [].forEach.call(tr.children, function(td,i){
        if(td.hasAttribute("colspan") || td.hasAttribute("data-l")) return;
        var l=ths[i]||"";
        if(l==="#") td.classList.add("idx");
        td.setAttribute("data-l", l);
      });
    });
  });
}
(function(){
  var pendiente=false;
  new MutationObserver(function(){
    if(pendiente) return; pendiente=true;
    requestAnimationFrame(function(){ pendiente=false; etiquetarTablas(); });
  }).observe(document.querySelector("main"), { childList:true, subtree:true });
})();

soltar(document.getElementById("zona-censo"), document.getElementById("file-censo"), function(fs){
  leer(fs[0]).then(function(filas){
    if(!filas.length){ toast("No se han reconocido columnas de colegiales en ese fichero."); return; }
    S.censo=filas; S.origen="fichero"; S.sel={}; guardar(); pintarCenso();
  }).catch(function(e){ toast("No se ha podido leer el fichero: "+e.message); });
});
document.getElementById("btn-abrir").addEventListener("click", function(e){
  e.stopPropagation(); document.getElementById("file-censo").click();
});
document.getElementById("btn-censo-hoja").addEventListener("click", function(e){ e.stopPropagation(); censoDesdeHoja(); });
document.getElementById("btn-censo-ejemplo").addEventListener("click", function(e){ e.stopPropagation(); cargarEjemplo(); });
document.getElementById("btn-pts-lista").addEventListener("click", function(){
  if(!S.lista.sesiones.length){ toast("Todavía no hay asistencia registrada en «Pasar lista»."); return; }
  S.puntosLista=true; guardar(); pintarPuntos(); toast("Puntos calculados con la asistencia de «Pasar lista».");
});

soltar(document.getElementById("zona-uni"), document.getElementById("file-uni"), function(fs){
  Promise.all(fs.map(function(f){ return leer(f).then(function(filas){ return {nombre:f.name, filas:filas}; }); }))
  .then(function(listas){
    ULTIMO_UNI=unificar(listas);
    document.getElementById("res-uni").innerHTML=renderUnificado(ULTIMO_UNI);
  }).catch(function(e){ toast("No se ha podido leer: "+e.message); });
}, true);
document.getElementById("res-uni").addEventListener("click", function(e){
  if(!e.target.closest("#btn-usar-uni") || !ULTIMO_UNI) return;
  S.censo=ULTIMO_UNI.unico.map(function(p){ delete p.__f; return p; });
  S.origen="fichero"; S.sel={}; guardar(); pintarCenso(); vista("censo");
});

soltar(document.getElementById("zona-pts"), document.getElementById("file-pts"), function(fs){
  leer(fs[0]).then(function(filas){
    var con=filas.filter(function(p){ return p.puntos!==""; });
    if(!con.length){ toast("No se ha encontrado una columna de puntos (TOTAL) en ese fichero."); return; }
    S.puntos=con; S.puntosLista=false; guardar(); pintarPuntos();
  }).catch(function(e){ toast("No se ha podido leer el fichero: "+e.message); });
});

document.getElementById("busca").addEventListener("input", pintarCenso);
document.getElementById("plano-busca").addEventListener("input", pintarPlano);
document.getElementById("plano-color").addEventListener("change", pintarPlano);
document.getElementById("plano-imprimir").addEventListener("click", impPlano);
document.getElementById("plano-lienzo").addEventListener("click", function(e){
  if(e.target.closest(".quien-edit")) return;
  var b=e.target.closest(".cuarto[data-hab]"); if(!b) return;
  fichaHab(b.dataset.hab);
});
document.getElementById("plano-lienzo").addEventListener("keydown", function(e){
  if(e.key!=="Enter" && e.key!==" ") return;
  if(e.target.closest(".quien-edit") || e.target.closest(".quien[data-idx]")) return;
  var b=e.target.closest(".cuarto[data-hab]"); if(!b) return;
  e.preventDefault();
  fichaHab(b.dataset.hab);
});

/* arrastrar un nombre a otra habitación */
document.getElementById("plano-lienzo").addEventListener("dragstart", function(e){
  var s=e.target.closest(".quien[draggable]"); if(!s) return;
  e.dataTransfer.setData("text/plain", s.dataset.idx);
  e.dataTransfer.effectAllowed="move";
});
document.getElementById("plano-lienzo").addEventListener("dragover", function(e){
  var b=e.target.closest(".cuarto[data-hab]"); if(!b || b.classList.contains("aula")) return;
  e.preventDefault();
  b.classList.add("arrastrando");
});
document.getElementById("plano-lienzo").addEventListener("dragleave", function(e){
  var b=e.target.closest(".cuarto[data-hab]"); if(!b) return;
  b.classList.remove("arrastrando");
});
document.getElementById("plano-lienzo").addEventListener("dragend", function(){
  document.querySelectorAll("#plano-lienzo .cuarto.arrastrando").forEach(function(el){ el.classList.remove("arrastrando"); });
});
document.getElementById("plano-lienzo").addEventListener("drop", function(e){
  var b=e.target.closest(".cuarto[data-hab]"); if(!b || b.classList.contains("aula")) return;
  e.preventDefault();
  b.classList.remove("arrastrando");
  var idx=+e.dataTransfer.getData("text/plain"), p=S.censo[idx];
  var num=numHab(b.dataset.hab);
  if(!p || !num) return;
  var antes=p.hab;
  if(String(num)===String(antes)) return;
  p.hab=String(num);
  guardar(); pintarCenso();
  toast(nombreCompleto(p)+" trasladado a la habitación "+num+(antes?" (antes "+antes+")":"")+".");
});

/* editar el nombre directamente sobre el plano */
document.getElementById("plano-lienzo").addEventListener("dblclick", function(e){
  var s=e.target.closest(".quien[data-idx]"); if(!s || s.querySelector("input")) return;
  e.stopPropagation();
  var idx=+s.dataset.idx, p=S.censo[idx]; if(!p) return;
  var actual=titulo(p.nom)+" "+titulo(p.a1);
  s.innerHTML='<input class="quien-edit" type="text" value="'+esc(actual)+'">';
  var input=s.querySelector("input");
  input.focus(); input.select();
  input.addEventListener("click", function(ev){ ev.stopPropagation(); });
  input.addEventListener("keydown", function(ev){
    if(ev.key==="Enter"){ ev.preventDefault(); input.blur(); }
    if(ev.key==="Escape"){ ev.preventDefault(); pintarPlano(); }
  });
  input.addEventListener("blur", function(){
    var texto=input.value.replace(/\s+/g," ").trim();
    if(!texto){ pintarPlano(); return; }
    var partes=texto.split(" ");
    p.nom=partes[0]; p.a1=partes.slice(1).join(" ")||p.a1;
    guardar(); pintarCenso();
    toast("Nombre actualizado.");
  }, {once:true});
});
document.addEventListener("click", function(e){
  var mv=e.target.closest("button[data-mover]");
  if(mv){
    var ix=+mv.dataset.mover, inp=document.querySelector('input[data-mover-in="'+ix+'"]'), pe=S.censo[ix];
    var num=parseInt(inp&&inp.value,10);
    if(!pe || !num){ toast("Escribe el número de la habitación a la que pasa."); return; }
    var antes=pe.hab; pe.hab=String(num); guardar();
    var ficha=PLANO_SEL; pintarCenso(); if(ficha) fichaHab(ficha);
    toast(nombreCompleto(pe)+" pasa a la habitación "+num+(antes?" (antes "+antes+")":"")+".");
    return;
  }
  var w=e.target.closest("button[data-wa-plano]");
  if(w){ abrirWhatsApp(S.censo[+w.dataset.waPlano]); return; }
  var c=e.target.closest("button[data-cert-plano]");
  if(c){
    var i=+c.dataset.certPlano;
    S.censo.forEach(function(_,k){ S.sel[k]= k===i; });
    pintarCertLista(); vista("certificados");
  }
});
document.getElementById("btn-imp-censo").addEventListener("click", impCenso);
document.getElementById("btn-imp-hab").addEventListener("click", impHab);
document.getElementById("btn-imp-cert").addEventListener("click", impCertificados);
document.getElementById("btn-imp-cartel").addEventListener("click", impCartel);
document.getElementById("btn-imp-pts").addEventListener("click", impPuntos);

document.getElementById("btn-copiar").addEventListener("click", function(){
  var d=filtrado(document.getElementById("busca").value);
  copiar([["Apellidos","Nombre","Teléfono","Habitación","DNI"]].concat(d.map(function(p){
    return [apellidos(p), titulo(p.nom), p.tel, p.hab, p.dni];
  })), this);
});
document.getElementById("btn-copiar-hab").addEventListener("click", function(){
  copiar([["Habitación","Apellidos","Nombre","Teléfono","DNI"]].concat(porHabitacion().map(function(p){
    return [p.hab, apellidos(p), titulo(p.nom), p.tel, p.dni];
  })), this);
});
document.getElementById("btn-copiar-pts").addEventListener("click", function(){
  copiar([["Apellidos","Nombre","Puntos","Créditos"]].concat(datosPuntos().map(function(p){
    return [apellidos(p), titulo(p.nom), p.puntos, creditos(p.puntos)];
  })), this);
});

document.getElementById("anu-busca").addEventListener("input", pintarAnuario);
document.getElementById("anu-filtro").addEventListener("change", pintarAnuario);
document.getElementById("btn-imp-pend").addEventListener("click", impPendientes);
document.getElementById("btn-imp-orla").addEventListener("click", impOrla);
document.getElementById("btn-copiar-anu").addEventListener("click", function(){
  var pend=S.censo.filter(function(p){ return !anuCompleto(p); });
  copiar([["Apellidos","Nombre","Habitación","Falta"]].concat(pend.map(function(p){
    return [apellidos(p), titulo(p.nom), p.hab, anuPendientesDe(p).join(", ")];
  })), this);
});
document.getElementById("tabla-anu").addEventListener("click", function(e){
  var b=e.target.closest("button.marca-tog");
  if(!b) return;
  var p=S.censo[+b.dataset.anu], a=anuDe(p), campo=b.dataset.campo;
  a[campo]=!a[campo];
  guardar(); pintarAnuario(); pintarMensajes();
});

(function(){
  var txt=document.getElementById("msg-texto");
  txt.value=PLANTILLAS.foto;
  document.getElementById("msg-vars").innerHTML=VARIABLES.map(function(v){
    return '<button class="marca-tog" data-var="'+v[0]+'" title="'+v[1]+'">'+v[0]+'</button>';
  }).join("");
  document.getElementById("msg-vars").addEventListener("click", function(e){
    var b=e.target.closest("button[data-var]"); if(!b) return;
    var p=txt.selectionStart||txt.value.length;
    txt.value=txt.value.slice(0,p)+b.dataset.var+txt.value.slice(txt.selectionEnd||p);
    txt.focus(); txt.selectionStart=txt.selectionEnd=p+b.dataset.var.length;
    pintarMensajes();
  });
  txt.addEventListener("input", pintarMensajes);
  document.getElementById("msg-plantilla").addEventListener("change", function(){
    txt.value=PLANTILLAS[this.value]||""; pintarMensajes();
  });
  document.getElementById("msg-publico").addEventListener("change", pintarMensajes);
  document.getElementById("msg-lista").addEventListener("click", function(e){
    var b=e.target.closest("[data-wa]"); if(!b) return;
    var p=S.censo[+b.dataset.wa];
    S.enviados[claveP(p)]=true; guardar();
    setTimeout(pintarMensajes, 400);
  });
  document.getElementById("msg-siguiente").addEventListener("click", function(){
    var p=publico().filter(function(x){ return !S.enviados[claveP(x)] && telefonoWa(x.tel); })[0];
    if(!p){ toast("No queda nadie por enviar en este grupo."); return; }
    abrirWhatsApp(p);
  });
  document.getElementById("msg-copiar-tel").addEventListener("click", function(){
    copiar([["Nombre","Teléfono"]].concat(publico().filter(function(p){ return telefonoWa(p.tel); })
      .map(function(p){ return [nombreCompleto(p), "+"+telefonoWa(p.tel)]; })), this);
  });
  document.getElementById("msg-reiniciar").addEventListener("click", function(){
    publico().forEach(function(p){ delete S.enviados[claveP(p)]; });
    guardar(); pintarMensajes();
  });
})();

/* --- clubes: inscripción Clupik --- */
(function(){
  var estado=document.getElementById("clupik-estado");
  var tabla=document.getElementById("tabla-clupik");
  var btnExtraer=document.getElementById("btn-clupik-extraer");
  var selModalidad=document.getElementById("clupik-modalidad-def");

  selModalidad.innerHTML=CLUPIK_MODALIDADES.map(function(m){ return '<option value="'+m.id+'">'+m.label+'</option>'; }).join("");

  function equipoDef(){ return document.getElementById("clupik-equipo-def").value; }
  function modalidadDef(){ return selModalidad.value; }

  function anadirFilas(filas, modalidad, genero){
    if(!filas || !filas.length) return 0;
    filas.forEach(function(f){
      S.clupik.push({
        a1: txt(f.a1), a2: txt(f.a2), nom: txt(f.nom||f.nombre),
        dni: txt(f.dni), fnac: txt(f.fnac||f.fecha_nacimiento||f.fechaNacimiento),
        tel: txt(f.tel), modalidad: modalidad, genero: genero, estado:"pendiente", notas: txt(f.notas)
      });
    });
    guardar(); pintarClupik();
    return filas.length;
  }

  /* Cada línea: «Apellidos, Nombre — DNI — fecha» (separadores: guion largo, barra vertical, tabulador o punto y coma) */
  function filasDeLineas(texto){
    return texto.split("\n").map(function(l){ return l.trim(); }).filter(Boolean).map(function(l){
      var trozos=l.split(/\s+[—–-]\s+|\s*[|;\t]\s*/).map(function(x){ return x.trim(); }).filter(Boolean);
      var nombre=trozos[0]||"", dni="", fnac="";
      trozos.slice(1).forEach(function(t){
        if(/^[XYZxyz]?\d{7,8}[A-Za-z]$/.test(t.replace(/\s/g,""))) dni=t.replace(/\s/g,"").toUpperCase();
        else if(/^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}$/.test(t)) fnac=t;
      });
      var a1="", a2="", nom=nombre;
      if(nombre.indexOf(",")>=0){
        var par=nombre.split(","); var ap=par[0].trim().split(/\s+/); nom=par.slice(1).join(",").trim();
        a1=ap[0]||""; a2=ap.slice(1).join(" ");
      }
      return { a1:a1, a2:a2, nom:nom, dni:dni, fnac:fnac, tel:"", notas:"" };
    });
  }

  btnExtraer.addEventListener("click", function(){
    var texto=document.getElementById("clupik-texto").value.trim();
    if(!texto){ estado.textContent="Escribe o pega primero la lista de personas."; return; }
    var n=anadirFilas(filasDeLineas(texto), modalidadDef(), equipoDef());
    document.getElementById("clupik-texto").value="";
    estado.textContent=n+" fila"+(n===1?"":"s")+" añadida"+(n===1?"":"s")+". Revisa y corrige los campos antes de usarlos.";
  });

  document.getElementById("btn-clupik-fila").addEventListener("click", function(){
    S.clupik.push({ a1:"", a2:"", nom:"", dni:"", fnac:"", tel:"", modalidad:modalidadDef(), genero:equipoDef(), estado:"pendiente", notas:"" });
    guardar(); pintarClupik();
  });

  document.getElementById("btn-clupik-vaciar").addEventListener("click", function(){
    if(!S.clupik.length) return;
    if(!confirm("¿Vaciar toda la lista de clubes? No se puede deshacer.")) return;
    S.clupik=[]; guardar(); pintarClupik();
  });

  document.getElementById("btn-clupik-copiar").addEventListener("click", function(){
    copiar([["Apellido 1","Apellido 2","Nombre","Documento","Fecha nacimiento","Club / disciplina","Género","Estado","Notas"]].concat(S.clupik.map(function(p){
      return [p.a1, p.a2, p.nom, p.dni, p.fnac, clupikModalidad(p).label, p.genero==="F"?"Femenino":"Masculino", clupikEtiqueta(p.estado), p.notas];
    })), this);
  });

  document.getElementById("btn-clupik-copiar-todo").addEventListener("click", function(){
    var self=this;
    if(!S.clupik.length) return;
    var texto=S.clupik.map(clupikFicha).join("\n\n---\n\n");
    var ok=function(){ var t=self.textContent; self.textContent="Copiado ✓"; setTimeout(function(){ self.textContent=t; },1600); };
    if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(texto).then(ok, function(){ fallback(texto, ok); }); }
    else fallback(texto, ok);
  });

  document.getElementById("btn-clupik-descargar").addEventListener("click", function(){
    if(!S.clupik.length) return;
    var filas=[["Apellido 1","Apellido 2","Nombre","Documento","Fecha nacimiento","Club / disciplina","Género","Estado","Regla","Notas"]].concat(S.clupik.map(function(p){
      return [p.a1, p.a2, p.nom, p.dni, p.fnac, clupikModalidad(p).label, p.genero==="F"?"Femenino":"Masculino", clupikEtiqueta(p.estado), clupikRegla(p), p.notas];
    }));
    var csv=filas.map(function(r){ return r.map(function(v){ v=String(v==null?"":v); return /[",\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v; }).join(","); }).join("\n");
    descargarBlob(new Blob(["\ufeff"+csv], {type:"text/csv;charset=utf-8"}), "clubes-clupik.csv");
    estado.textContent="CSV descargado.";
  });

  tabla.addEventListener("input", function(e){
    var t=e.target;
    if(!t.classList.contains("cbo-in") || t.tagName!=="INPUT") return;
    var tr=t.closest("tr"); if(!tr) return;
    var i=+tr.dataset.i, f=t.dataset.f;
    if(!S.clupik[i]) return;
    S.clupik[i][f]=t.value; guardar();
  });
  tabla.addEventListener("change", function(e){
    var t=e.target;
    if(!t.classList.contains("cbo-in") || t.tagName!=="SELECT") return;
    var tr=t.closest("tr"); if(!tr) return;
    var i=+tr.dataset.i, f=t.dataset.f;
    if(!S.clupik[i]) return;
    S.clupik[i][f]=t.value; guardar(); pintarClupik();
  });
  tabla.addEventListener("click", function(e){
    var b=e.target.closest("button[data-accion]"); if(!b) return;
    var tr=b.closest("tr"); if(!tr) return;
    var i=+tr.dataset.i;
    if(b.dataset.accion==="borrar"){
      if(!confirm("¿Quitar esta fila de la lista?")) return;
      S.clupik.splice(i,1); guardar(); pintarClupik();
    } else if(b.dataset.accion==="copiar"){
      var texto=clupikFicha(S.clupik[i]);
      var ok=function(){ var t=b.textContent; b.textContent="✓"; setTimeout(function(){ b.textContent=t; },1200); };
      if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(texto).then(ok, function(){ fallback(texto, ok); }); }
      else fallback(texto, ok);
    }
  });
})();

document.getElementById("sorteo-girar").addEventListener("click", girar);
document.getElementById("sorteo-otra").addEventListener("click", girar);
document.getElementById("sorteo-grupo").addEventListener("change", function(){ SORTEO.ultimo=null; pintarSorteo(); });
document.getElementById("sorteo-sinrep").addEventListener("change", pintarSorteo);
document.getElementById("sorteo-limpiar").addEventListener("click", function(){
  SORTEO.salidos=[]; SORTEO.ultimo=null;
  document.querySelector(".bombo").classList.remove("ganador");
  document.getElementById("sorteo-nota").textContent="Pulsa para empezar.";
  document.getElementById("sorteo-otra").hidden=true;
  guardar(); pintarSorteo();
});
document.getElementById("sorteo-copiar").addEventListener("click", function(){
  copiar([["#","Colegial","Habitación"]].concat(SORTEO.salidos.map(function(k,i){
    var p=S.censo.filter(function(x){ return claveP(x)===k; })[0];
    return [i+1, p? nombreCompleto(p):k, p? p.hab:""];
  })), this);
});

document.getElementById("cert-busca").addEventListener("input", pintarCertLista);
document.getElementById("cert-todos").addEventListener("click", function(){ S.sel={}; pintarCertLista(); });
document.getElementById("cert-ninguno").addEventListener("click", function(){
  S.censo.forEach(function(_,i){ S.sel[i]=false; }); pintarCertLista();
});
document.getElementById("cert-lista").addEventListener("change", function(e){
  if(e.target.type==="checkbox"){ S.sel[e.target.dataset.i]=e.target.checked; pintarCertLista(); }
});
document.getElementById("cert-lista").addEventListener("click", function(e){
  var b=e.target.closest("button.gen");
  if(!b) return;
  e.preventDefault();
  var p=S.censo[+b.dataset.g], k=claveP(p);
  S.generoManual[k] = generoDe(p)==="F" ? "M":"F";
  guardar(); pintarCertLista();
});

/* ====================================================================
   PASAR LISTA · categorías libres, sesiones, totales y sincronización
   con una hoja de Google (Apps Script)
   ==================================================================== */
var LT="pasar";                       // pestaña activa de «Pasar lista»
var SYNC={ trabajando:false, error:"", ultimo:0, timer:null, repetir:false };
var SUGERIDAS=["Actividades culturales","Deportes","Reuniones","Voluntariado","Conferencias"];

function hoyISO(){ var d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function redondear(n){ return Math.round((Number(n)||0)*10)/10; }
function fechaLarga(iso){
  if(!iso) return "";
  var d=new Date(iso+"T12:00:00");
  return isNaN(d) ? iso : d.toLocaleDateString("es-ES",{weekday:"short", day:"numeric", month:"short", year:"numeric"});
}
function catPorId(id){ return S.lista.categorias.filter(function(c){ return c.id===id; })[0]; }
function sesPorId(id){ return S.lista.sesiones.filter(function(x){ return x.id===id; })[0]; }
function nombreCat(id){ var c=catPorId(id); return c ? c.nombre : "(categoría borrada)"; }
function puntosSesion(ses){ var c=catPorId(ses.cat); return c ? (Number(c.puntos)||0) : 0; }
function totalPuntos(p, catId){
  var k=claveP(p), t=0;
  S.lista.sesiones.forEach(function(x){
    if(catId && x.cat!==catId) return;
    if(x.marcas[k]==="P") t+=puntosSesion(x);
  });
  return redondear(t);
}
function puntosDeLista(){
  return S.censo.map(function(p){ var o=Object.assign({}, p); o.puntos=String(totalPuntos(p)); return o; });
}
function ptsDe(p){ return S.puntosLista ? String(totalPuntos(p)) : p.puntos; }

function tocarSesion(ses){ ses.mod=Date.now(); guardar(); programarSync(); }
function tocarCat(c){ c.mod=Date.now(); guardar(); programarSync(); }
function sucia(x){ return (x.mod||0) > (x.sync||0); }
function pendientesSync(){
  return S.lista.sesiones.filter(sucia).length + S.lista.categorias.filter(sucia).length +
         S.lista.borradas.length + S.lista.catBorradas.length;
}

/* ---------- conexión con la hoja ---------- */
function hojaCfg(){ return S.ajustes.sheets; }
function hojaConfigurada(){
  var c=hojaCfg(), u=(c.url||"").trim();
  var okUrl = /^https:\/\/script\.google\.com\/.+\/exec/.test(u) ||
              (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /^http:\/\/(localhost|127\.0\.0\.1)[:\/]/.test(u));
  return !!(okUrl && (c.token||"").trim());
}
function hojaLlamar(accion, datos){
  if(!hojaConfigurada()) return Promise.reject(new Error("Falta configurar la hoja de Google (dirección y clave)."));
  var c=hojaCfg();
  var ctl=("AbortController" in window) ? new AbortController() : null;
  var t=setTimeout(function(){ if(ctl) ctl.abort(); }, 40000);
  var cuerpo=JSON.stringify(Object.assign({ accion:accion, token:c.token.trim() }, datos||{}));
  return fetch(c.url.trim(), { method:"POST", headers:{ "Content-Type":"text/plain;charset=utf-8" }, body:cuerpo,
                               redirect:"follow", signal: ctl ? ctl.signal : undefined })
    .then(function(r){ return r.text(); })
    .then(function(texto){
      clearTimeout(t);
      var j;
      try{ j=JSON.parse(texto); }
      catch(e){ throw new Error("La hoja no ha respondido como se esperaba. Comprueba que la dirección es la de la implementación (termina en /exec) y que el acceso es «Cualquier usuario»."); }
      if(!j.ok) throw new Error(j.error || "La hoja ha devuelto un error.");
      return j;
    }, function(e){
      clearTimeout(t);
      throw new Error(e && e.name==="AbortError" ? "La hoja ha tardado demasiado en responder." : "No se ha podido conectar con la hoja (¿hay conexión?).");
    });
}

function marcasParaEnviar(ses){
  var mapa={};
  S.censo.forEach(function(p){ mapa[claveP(p)]=p; });
  var pts=puntosSesion(ses);
  return Object.keys(ses.marcas).map(function(k){
    var p=mapa[k], e=ses.marcas[k];
    return { k:k, a: p?apellidos(p):"", n: p?titulo(p.nom):"", h: p?(p.hab||""):"", e:e, p: e==="P"?pts:0 };
  });
}

function fusionar(r){
  var L=S.lista;
  (r.categorias||[]).forEach(function(rc){
    if(rc.borrada){
      var i=L.categorias.map(function(c){return c.id;}).indexOf(rc.id);
      if(i>=0 && !sucia(L.categorias[i])) L.categorias.splice(i,1);
      return;
    }
    if(L.catBorradas.indexOf(rc.id)>=0) return;
    var loc=catPorId(rc.id), mod=Number(rc.mod)||0;
    if(!loc) L.categorias.push({ id:rc.id, nombre:rc.nombre, puntos:Number(rc.puntos)||0, mod:mod, sync:mod });
    else if(!sucia(loc)){ loc.nombre=rc.nombre; loc.puntos=Number(rc.puntos)||0; loc.mod=mod; loc.sync=mod; }
  });
  var porSes={};
  (r.asistencia||[]).forEach(function(a){ (porSes[a.sid]=porSes[a.sid]||{})[a.clave]=a.estado; });
  (r.sesiones||[]).forEach(function(rs){
    var mod=Number(rs.mod)||0, loc=sesPorId(rs.id);
    if(rs.borrada){
      if(loc && !sucia(loc)){
        L.sesiones.splice(L.sesiones.indexOf(loc),1);
        if(L.actual===rs.id) L.actual=null;
      }
      return;
    }
    if(L.borradas.indexOf(rs.id)>=0) return;
    if(!loc){
      L.sesiones.push({ id:rs.id, cat:rs.cat, fecha:rs.fecha, titulo:rs.titulo||"", marcas:porSes[rs.id]||{}, mod:mod, sync:mod });
    } else if(!sucia(loc) && mod>=(loc.mod||0)){
      loc.cat=rs.cat; loc.fecha=rs.fecha; loc.titulo=rs.titulo||""; loc.marcas=porSes[rs.id]||{}; loc.mod=mod; loc.sync=mod;
    }
  });
  // lo que estaba sincronizado y ya no está en la hoja (hoja vaciada) se vuelve a enviar
  var remotas={}; (r.sesiones||[]).forEach(function(rs){ remotas[rs.id]=true; });
  L.sesiones.forEach(function(x){ if(!sucia(x) && !remotas[x.id]) x.sync=0; });
  var remotasC={}; (r.categorias||[]).forEach(function(rc){ remotasC[rc.id]=true; });
  L.categorias.forEach(function(c){ if(!sucia(c) && !remotasC[c.id]) c.sync=0; });
}

function enviarPendiente(){
  var L=S.lista;
  var sucias=L.sesiones.filter(sucia);
  var cats=L.categorias.filter(sucia);
  var borr=L.borradas.slice(), cborr=L.catBorradas.slice();
  if(!sucias.length && !cats.length && !borr.length && !cborr.length) return Promise.resolve(false);
  var marcaTiempo=sucias.map(function(x){ return [x, x.mod]; });
  var marcaCat=cats.map(function(c){ return [c, c.mod]; });
  var datos={
    categorias: cats.map(function(c){ return { id:c.id, nombre:c.nombre, puntos:c.puntos, mod:c.mod }; }),
    categoriasBorradas: cborr,
    sesiones: sucias.map(function(x){
      return { id:x.id, cat:x.cat, catNombre:nombreCat(x.cat), fecha:x.fecha, titulo:x.titulo||"", mod:x.mod, puntos:puntosSesion(x), marcas:marcasParaEnviar(x) };
    }),
    sesionesBorradas: borr
  };
  return hojaLlamar("lista_guardar", datos).then(function(){
    marcaTiempo.forEach(function(par){ par[0].sync=par[1]; });
    marcaCat.forEach(function(par){ par[0].sync=par[1]; });
    L.borradas=L.borradas.filter(function(id){ return borr.indexOf(id)<0; });
    L.catBorradas=L.catBorradas.filter(function(id){ return cborr.indexOf(id)<0; });
    return true;
  });
}

function sincronizar(silencioso){
  if(!hojaConfigurada()){
    if(!silencioso) toast("Primero conecta tu hoja de Google en «Categorías y hoja».", "mal");
    return Promise.resolve(false);
  }
  if(SYNC.trabajando){ SYNC.repetir=true; return Promise.resolve(false); }
  if(navigator.onLine===false){
    SYNC.error="Sin conexión: se enviará cuando vuelva."; pintarSync();
    if(!silencioso) toast("Sin conexión. Se sincronizará cuando vuelva.");
    return Promise.resolve(false);
  }
  SYNC.trabajando=true; SYNC.error=""; pintarSync();
  return hojaLlamar("todo").then(function(r){ fusionar(r); guardar(); return enviarPendiente(); })
    .then(function(){
      SYNC.ultimo=Date.now(); S.lista.ultSync=SYNC.ultimo; guardar();
      if(!silencioso) toast("Sincronizado con la hoja de Google.");
      return true;
    })
    .catch(function(e){
      SYNC.error=e.message || "Error de sincronización";
      if(!silencioso) toast(SYNC.error, "mal");
      return false;
    })
    .then(function(ok){
      SYNC.trabajando=false;
      pintarLista();
      if(SYNC.repetir){ SYNC.repetir=false; programarSync(); }
      return ok;
    });
}
function programarSync(){
  pintarSync();
  if(!S.ajustes.sheets.auto || !hojaConfigurada()) return;
  clearTimeout(SYNC.timer);
  SYNC.timer=setTimeout(function(){ sincronizar(true); }, 3000);
}
function pintarSync(){
  var punto=document.getElementById("topbar-sync");
  var conf=hojaConfigurada(), n=pendientesSync();
  var estado = !conf ? "" : (SYNC.error ? "mal" : (SYNC.trabajando||n ? "pend" : "ok"));
  if(punto){
    punto.hidden=!conf;
    punto.className="sync-pt "+estado;
    punto.title = SYNC.trabajando ? "Sincronizando…" : SYNC.error ? SYNC.error : n ? n+" cambio"+(n===1?"":"s")+" sin enviar" : "Todo sincronizado";
  }
  var e=document.getElementById("lista-estado");
  if(e){
    var h='';
    if(!conf) h+='<span class="chip demo"><span class="punto"></span>Hoja sin conectar</span>';
    else if(SYNC.trabajando) h+='<span class="chip demo"><span class="punto"></span>Sincronizando…</span>';
    else if(SYNC.error) h+='<span class="chip demo" title="'+esc(SYNC.error)+'"><span class="punto"></span>Sin sincronizar</span>';
    else if(n) h+='<span class="chip demo"><span class="punto"></span>'+n+' sin enviar</span>';
    else h+='<span class="chip real"><span class="punto"></span>Sincronizado</span>';
    h+='<span class="chip"><b>'+S.lista.sesiones.length+'</b>&nbsp;'+(S.lista.sesiones.length===1?'sesión':'sesiones')+'</span>';
    e.innerHTML=h;
  }
}

/* ---------- descargas (móvil: hoja de compartir; escritorio: descarga directa) ---------- */
function descargarBlob(blob, nombre){
  var esMovil = /android|iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.maxTouchPoints>1 && /mac/i.test(navigator.platform));
  try{
    if(esMovil && window.File && navigator.canShare && navigator.share){
      var f=new File([blob], nombre, { type: blob.type });
      if(navigator.canShare({ files:[f] })){
        navigator.share({ files:[f], title:nombre }).catch(function(e){ if(e && e.name!=="AbortError") enlaceDescarga(blob, nombre); });
        return;
      }
    }
  }catch(e){}
  enlaceDescarga(blob, nombre);
}
function enlaceDescarga(blob, nombre){
  var u=URL.createObjectURL(blob), a=document.createElement("a");
  a.href=u; a.download=nombre; a.style.display="none";
  document.body.appendChild(a); a.click();
  setTimeout(function(){ a.remove(); URL.revokeObjectURL(u); }, 4000);
}

/* ---------- render ---------- */
function llenarSelectCat(sel, conTodas, valor){
  if(!sel) return;
  var v = valor!==undefined ? valor : sel.value;
  var h = conTodas ? '<option value="">Todas las categorías</option>' : '';
  h+=S.lista.categorias.map(function(c){ return '<option value="'+esc(c.id)+'">'+esc(c.nombre)+(c.puntos?' · '+c.puntos+' pt':'')+'</option>'; }).join("");
  sel.innerHTML=h;
  if(v && catPorId(v)) sel.value=v; else if(!conTodas && S.lista.categorias.length) sel.value=S.lista.categorias[0].id; else sel.value="";
}
function chipsSugeridas(){
  var usadas=S.lista.categorias.map(function(c){ return norm(c.nombre); });
  return SUGERIDAS.filter(function(n){ return usadas.indexOf(norm(n))<0; })
    .map(function(n){ return '<button type="button" class="marca-tog" data-sug="'+esc(n)+'">+ '+esc(n)+'</button>'; }).join("");
}
function ordenados(){
  return S.censo.map(function(p,i){ return p; }).sort(function(a,b){
    return norm(apellidos(a)+" "+a.nom).localeCompare(norm(apellidos(b)+" "+b.nom),"es");
  });
}

function pintarLista(){
  pintarSync();
  var tabs=document.querySelectorAll("#lista-tabs button");
  tabs.forEach(function(b){ b.setAttribute("aria-selected", String(b.dataset.t===LT)); });
  document.querySelectorAll("#v-lista .subvista").forEach(function(s){ s.classList.toggle("on", s.id==="lt-"+LT); });
  if(LT==="pasar") pintarPasar();
  else if(LT==="historial") pintarHistorial();
  else if(LT==="totales") pintarTotales();
  else pintarAjustesLista();
}

function pintarPasar(){
  var aviso=document.getElementById("lista-aviso"), nueva=document.getElementById("lista-nueva"), ses=document.getElementById("lista-sesion");
  var L=S.lista, abierta = L.actual ? sesPorId(L.actual) : null;
  if(L.actual && !abierta) L.actual=null;
  if(!S.censo.length){
    aviso.hidden=false; nueva.hidden=true; ses.hidden=true;
    aviso.innerHTML='<h3>Primero, el censo</h3><p class="nota" style="margin:0 0 12px; font-size:13.5px">Para pasar lista hace falta la lista de colegiales. Cárgala desde un Excel, tráela de tu hoja de Google o prueba con datos de ejemplo.</p>'+
      '<div class="barra" style="margin-bottom:0"><button class="btn p" data-ir-censo="fichero" type="button">Cargar un Excel o CSV</button>'+
      '<button class="btn" data-ir-censo="hoja" type="button">Traer de mi hoja de Google</button>'+
      '<button class="btn" data-ir-censo="ejemplo" type="button">Datos de ejemplo</button></div>';
    return;
  }
  if(!L.categorias.length){
    aviso.hidden=false; nueva.hidden=true; ses.hidden=true;
    aviso.innerHTML='<h3>Crea tu primera categoría</h3><p class="nota" style="margin:0 0 12px; font-size:13.5px">Una categoría es un tipo de acto o actividad. Elige una de estas o crea la tuya en «Categorías y hoja». Cada una da los puntos que tú decidas por asistencia.</p>'+
      '<div class="sugeridas" style="margin-top:0">'+chipsSugeridas()+'</div>'+
      '<div class="barra" style="margin:12px 0 0"><button class="btn" data-lista-tab="ajustes" type="button">Crear una categoría propia</button></div>';
    return;
  }
  aviso.hidden=true;
  if(!abierta){
    nueva.hidden=false; ses.hidden=true;
    llenarSelectCat(document.getElementById("ls-cat"), false, S.ajustes.campos["ls-cat"]);
    var f=document.getElementById("ls-fecha"); if(!f.value) f.value=hoyISO();
    var n=pendientesSync();
    document.getElementById("ls-pendiente").textContent = S.lista.sesiones.length
      ? (S.lista.sesiones.length+" sesión"+(S.lista.sesiones.length===1?"":"es")+" guardada"+(S.lista.sesiones.length===1?"":"s")+". "+(hojaConfigurada()?(n?n+" cambio"+(n===1?"":"s")+" por enviar a la hoja.":"Todo enviado a la hoja."):"Conecta tu hoja de Google para tenerlas a salvo."))
      : "";
    return;
  }
  nueva.hidden=true; ses.hidden=false;
  pintarSesion(abierta);
}

function contarSesion(ses){
  var c={P:0,A:0,J:0};
  S.censo.forEach(function(p){ var e=ses.marcas[claveP(p)]; if(e) c[e]++; });
  c.N=S.censo.length-c.P-c.A-c.J;
  return c;
}
function pintarContadores(ses){
  var c=contarSesion(ses);
  document.getElementById("ls-cont").innerHTML=
    '<div class="contador p"><b>'+c.P+'</b><span>Presentes</span></div>'+
    '<div class="contador a"><b>'+c.A+'</b><span>Ausentes</span></div>'+
    '<div class="contador j"><b>'+c.J+'</b><span>Justif.</span></div>'+
    '<div class="contador"><b>'+c.N+'</b><span>Sin marcar</span></div>';
}
function filaLista(p, ses){
  var k=claveP(p), e=ses.marcas[k]||"";
  var etq={P:"Presente",A:"Ausente",J:"Justificado"};
  return '<div class="fila-lista" data-k="'+esc(k)+'" data-e="'+e+'">'+
    '<div class="nm"><strong>'+esc(apellidos(p))+', '+esc(titulo(p.nom))+'</strong><span>'+(p.hab?'Hab. '+esc(p.hab):'Sin habitación')+'</span></div>'+
    '<div class="seg">'+["P","A","J"].map(function(x){
      return '<button type="button" data-e="'+x+'" aria-pressed="'+(e===x)+'" aria-label="'+etq[x]+'">'+x+'</button>';
    }).join("")+'</div></div>';
}
function pintarSesion(ses){
  var c=catPorId(ses.cat), pts=puntosSesion(ses);
  document.getElementById("ls-cab").innerHTML=
    '<div style="flex:1; min-width:0"><div class="t">'+esc(ses.titulo||nombreCat(ses.cat))+'</div>'+
    '<div class="f">'+esc(nombreCat(ses.cat))+' · '+esc(fechaLarga(ses.fecha))+' · '+(pts?pts+' punto'+(pts===1?'':'s')+' por asistencia':'sin puntos')+'</div></div>';
  pintarContadores(ses);
  var q=norm(document.getElementById("ls-busca").value||""), filtro=document.getElementById("ls-filtro").value;
  var h="", vistos=0;
  ordenados().forEach(function(p){
    var e=ses.marcas[claveP(p)]||"";
    if(q && norm([p.a1,p.a2,p.nom,p.hab].join(" ")).indexOf(q)<0) return;
    if(filtro==="pendientes" && e) return;
    if((filtro==="P"||filtro==="A"||filtro==="J") && e!==filtro) return;
    vistos++;
    h+=filaLista(p, ses);
  });
  document.getElementById("ls-filas").innerHTML = h || '<div class="vacio-lista">'+(filtro==="pendientes" && !q ? "Ya has marcado a todo el mundo." : "Nadie coincide con este filtro.")+'</div>';
}

function marcar(k, e){
  var ses=sesPorId(S.lista.actual); if(!ses) return;
  if(ses.marcas[k]===e) delete ses.marcas[k]; else ses.marcas[k]=e;
  tocarSesion(ses);
  var fila=document.querySelector('#ls-filas .fila-lista[data-k="'+(window.CSS&&CSS.escape?CSS.escape(k):k)+'"]');
  if(fila){
    var nuevo=ses.marcas[k]||"";
    fila.dataset.e=nuevo;
    fila.querySelectorAll(".seg button").forEach(function(b){ b.setAttribute("aria-pressed", String(b.dataset.e===nuevo)); });
    var filtro=document.getElementById("ls-filtro").value;
    if(filtro==="pendientes" || filtro==="P" || filtro==="A" || filtro==="J") setTimeout(function(){ if(sesPorId(S.lista.actual)===ses) pintarSesion(ses); }, 450);
  }
  pintarContadores(ses);
}

function pintarHistorial(){
  llenarSelectCat(document.getElementById("lh-cat"), true);
  var cat=document.getElementById("lh-cat").value;
  var lista=S.lista.sesiones.filter(function(x){ return !cat || x.cat===cat; })
    .sort(function(a,b){ return (b.fecha||"").localeCompare(a.fecha||"") || (b.mod||0)-(a.mod||0); });
  var h=lista.map(function(x){
    var c=contarSesion(x);
    return '<div class="ses-fila" data-id="'+esc(x.id)+'"><div class="inf"><strong>'+esc(x.titulo||nombreCat(x.cat))+'</strong>'+
      '<span>'+esc(nombreCat(x.cat))+' · '+esc(fechaLarga(x.fecha))+' · '+c.P+' presentes · '+c.A+' ausentes · '+c.J+' justif.</span></div>'+
      (hojaConfigurada()?(sucia(x)?'<span class="pill sync-pend">por enviar</span>':'<span class="pill sync-ok">en la hoja</span>'):'')+
      '<div class="acc"><button class="btn" type="button" data-abrir="'+esc(x.id)+'">Abrir</button>'+
      '<button class="btn" type="button" data-borrar="'+esc(x.id)+'">Borrar</button></div></div>';
  }).join("");
  document.getElementById("lh-lista").innerHTML = h || '<div class="vacio-lista panel">Todavía no hay sesiones'+(cat?' en esta categoría':'')+'. Empieza en «Pasar lista».</div>';
}

function filasTotales(catId){
  var sesiones=S.lista.sesiones.filter(function(x){ return !catId || x.cat===catId; });
  return ordenados().map(function(p){
    var k=claveP(p), P=0, A=0, J=0, pts=0;
    sesiones.forEach(function(x){
      var e=x.marcas[k];
      if(e==="P"){ P++; pts+=puntosSesion(x); } else if(e==="A") A++; else if(e==="J") J++;
    });
    return { p:p, P:P, A:A, J:J, pts:redondear(pts), total:sesiones.length };
  }).sort(function(a,b){ return b.pts-a.pts || b.P-a.P; });
}
function pintarTotales(){
  llenarSelectCat(document.getElementById("lt-cat"), true);
  var cat=document.getElementById("lt-cat").value;
  var q=norm(document.getElementById("lt-busca").value||"");
  var todas=filasTotales(cat);
  var nSes=S.lista.sesiones.filter(function(x){ return !cat || x.cat===cat; }).length;
  var conAsist=todas.filter(function(f){ return f.P>0; }).length;
  var media = todas.length ? todas.reduce(function(s,f){ return s+f.pts; },0)/todas.length : 0;
  document.getElementById("lt-tarjetas").innerHTML=[
    tarjeta("Sesiones", nSes, cat?nombreCat(cat):"de todas las categorías", ""),
    tarjeta("Han asistido", conAsist+" / "+S.censo.length, "al menos a una sesión", ""),
    tarjeta("Media de puntos", media.toFixed(1), "por colegial", ""),
    tarjeta("Sin ninguna asistencia", S.censo.length-conAsist, "colegiales", S.censo.length-conAsist?"av":"ok")
  ].join("");
  var filas=todas.filter(function(f){ return !q || norm([f.p.a1,f.p.a2,f.p.nom,f.p.hab].join(" ")).indexOf(q)>=0; });
  var h='<thead><tr><th class="num">#</th><th>Apellidos</th><th>Nombre</th><th>Hab.</th><th class="num">Presente</th><th class="num">Ausente</th><th class="num">Justif.</th><th class="num">Puntos</th><th class="num">Créditos</th></tr></thead><tbody>';
  filas.forEach(function(f,i){
    var cred = cat ? '—' : String(creditos(totalPuntos(f.p)));
    h+='<tr><td class="num idx" style="color:var(--ink-faint)">'+(i+1)+'</td><td><strong>'+esc(apellidos(f.p))+'</strong></td><td>'+esc(titulo(f.p.nom))+'</td>'+
       '<td class="hab">'+esc(f.p.hab||"—")+'</td><td class="num mono">'+f.P+' / '+f.total+'</td><td class="num mono">'+f.A+'</td><td class="num mono">'+f.J+'</td>'+
       '<td class="num mono"><strong>'+f.pts+'</strong></td><td class="num mono">'+cred+'</td></tr>';
  });
  if(!filas.length) h+='<tr><td colspan="9" style="padding:24px;text-align:center;color:var(--ink-faint)">'+(S.censo.length?'Sin resultados.':'Carga primero el censo.')+'</td></tr>';
  document.getElementById("lt-tabla").innerHTML=h+'</tbody>';
}

function pintarAjustesLista(){
  var L=S.lista;
  var h=L.categorias.map(function(c){
    var n=L.sesiones.filter(function(x){ return x.cat===c.id; }).length;
    return '<div class="cat-fila" data-id="'+esc(c.id)+'">'+
      '<input type="text" data-f="nombre" value="'+esc(c.nombre)+'" aria-label="Nombre de la categoría">'+
      '<input type="number" data-f="puntos" value="'+esc(c.puntos)+'" min="0" step="0.5" inputmode="decimal" aria-label="Puntos por asistencia" title="Puntos por asistencia">'+
      '<span class="nota" style="margin:0; min-width:54px; text-align:right">'+n+' ses.</span>'+
      '<button class="x" type="button" data-del-cat="'+esc(c.id)+'" aria-label="Borrar categoría">✕</button></div>';
  }).join("");
  document.getElementById("lc-lista").innerHTML = h || '<div class="vacio-lista">Aún no hay categorías.</div>';
  document.getElementById("lc-sugeridas").innerHTML=chipsSugeridas();
  var c=hojaCfg();
  var u=document.getElementById("hs-url"), t=document.getElementById("hs-token"), a=document.getElementById("hs-auto");
  if(document.activeElement!==u) u.value=c.url||"";
  if(document.activeElement!==t) t.value=c.token||"";
  a.checked=!!c.auto;
}

function anadirCategoria(nombre, puntos){
  nombre=(nombre||"").trim();
  if(!nombre){ toast("Escribe el nombre de la categoría."); return false; }
  if(S.lista.categorias.some(function(c){ return norm(c.nombre)===norm(nombre); })){ toast("Ya existe una categoría con ese nombre."); return false; }
  var c={ id:uid(), nombre:nombre, puntos:redondear(puntos===undefined?1:puntos), mod:Date.now(), sync:0 };
  S.lista.categorias.push(c);
  S.ajustes.campos["ls-cat"]=c.id;
  guardar(); programarSync();
  return true;
}

/* ---------- Excel / copia ---------- */
function exportarExcel(){
  if(typeof XLSX==="undefined"){ toast("La librería de Excel no ha cargado. Recarga la página.", "mal"); return; }
  var L=S.lista;
  if(!L.sesiones.length){ toast("Todavía no hay sesiones que exportar."); return; }
  var ses=L.sesiones.slice().sort(function(a,b){ return (a.fecha||"").localeCompare(b.fecha||"") || (a.mod||0)-(b.mod||0); });
  var cats=L.categorias;
  var tot=[["Apellidos","Nombre","Habitación"].concat(cats.map(function(c){ return c.nombre+" (puntos)"; })).concat(["Puntos totales","Créditos"])];
  ordenados().forEach(function(p){
    var fila=[apellidos(p), titulo(p.nom), p.hab||""];
    cats.forEach(function(c){ fila.push(totalPuntos(p, c.id)); });
    var t=totalPuntos(p); fila.push(t); fila.push(creditos(t));
    tot.push(fila);
  });
  var mat=[["Apellidos","Nombre","Habitación"].concat(ses.map(function(x){ return x.fecha+" · "+(x.titulo||nombreCat(x.cat)); }))];
  mat.push(["","","Categoría"].concat(ses.map(function(x){ return nombreCat(x.cat); })));
  ordenados().forEach(function(p){
    mat.push([apellidos(p), titulo(p.nom), p.hab||""].concat(ses.map(function(x){ return x.marcas[claveP(p)]||""; })));
  });
  var largo=[["Fecha","Categoría","Sesión","Apellidos","Nombre","Habitación","Estado","Puntos"]];
  var est={P:"Presente",A:"Ausente",J:"Justificado"};
  ses.forEach(function(x){
    ordenados().forEach(function(p){
      var e=x.marcas[claveP(p)]; if(!e) return;
      largo.push([x.fecha, nombreCat(x.cat), x.titulo||"", apellidos(p), titulo(p.nom), p.hab||"", est[e], e==="P"?puntosSesion(x):0]);
    });
  });
  var wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tot), "Totales");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mat), "Matriz");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(largo), "Asistencia");
  var out=XLSX.write(wb, { bookType:"xlsx", type:"array" });
  descargarBlob(new Blob([out], { type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "asistencia-"+hoyISO()+".xlsx");
}

/* ---------- eventos ---------- */
function irListaTab(t){ LT=t; pintarLista(); }
(function(){
  document.getElementById("lista-tabs").addEventListener("click", function(e){
    var b=e.target.closest("button[data-t]"); if(!b) return;
    irListaTab(b.dataset.t);
  });
  document.getElementById("v-lista").addEventListener("click", function(e){
    var t=e.target.closest("[data-lista-tab]");
    if(t){ irListaTab(t.dataset.listaTab); return; }
    var s=e.target.closest("button[data-sug]");
    if(s){ if(anadirCategoria(s.dataset.sug, 1)) pintarLista(); return; }
  });

  document.getElementById("ls-cat").addEventListener("change", function(){ S.ajustes.campos["ls-cat"]=this.value; guardar(); });
  document.getElementById("ls-crear").addEventListener("click", function(){
    var cat=document.getElementById("ls-cat").value, fecha=document.getElementById("ls-fecha").value||hoyISO();
    if(!cat){ toast("Elige una categoría."); return; }
    var ses={ id:uid(), cat:cat, fecha:fecha, titulo:document.getElementById("ls-titulo").value.trim(), marcas:{}, mod:Date.now(), sync:0 };
    S.lista.sesiones.push(ses); S.lista.actual=ses.id;
    document.getElementById("ls-titulo").value=""; document.getElementById("ls-fecha").value=hoyISO();
    document.getElementById("ls-busca").value=""; document.getElementById("ls-filtro").value="todos";
    guardar(); programarSync(); pintarLista(); window.scrollTo(0,0);
  });
  document.getElementById("ls-filas").addEventListener("click", function(e){
    var b=e.target.closest(".seg button"); if(!b) return;
    var fila=b.closest(".fila-lista"); if(!fila) return;
    marcar(fila.dataset.k, b.dataset.e);
  });
  document.getElementById("ls-busca").addEventListener("input", function(){ var s=sesPorId(S.lista.actual); if(s) pintarSesion(s); });
  document.getElementById("ls-filtro").addEventListener("change", function(){ var s=sesPorId(S.lista.actual); if(s) pintarSesion(s); });
  document.getElementById("ls-todos").addEventListener("click", function(){
    var s=sesPorId(S.lista.actual); if(!s) return;
    var n=0; S.censo.forEach(function(p){ var k=claveP(p); if(!s.marcas[k]){ s.marcas[k]="P"; n++; } });
    if(!n){ toast("Ya está todo marcado."); return; }
    tocarSesion(s); pintarSesion(s); toast(n+" marcados como presentes. Corrige las ausencias.");
  });
  document.getElementById("ls-limpiar").addEventListener("click", function(){
    var s=sesPorId(S.lista.actual); if(!s) return;
    if(!Object.keys(s.marcas).length) return;
    if(!confirm("¿Borrar todas las marcas de esta sesión?")) return;
    s.marcas={}; tocarSesion(s); pintarSesion(s);
  });
  document.getElementById("ls-cerrar-2").addEventListener("click", function(){ document.getElementById("ls-cerrar").click(); });
  document.getElementById("ls-cerrar").addEventListener("click", function(){
    var s=sesPorId(S.lista.actual); if(!s) return;
    var c=contarSesion(s);
    S.lista.actual=null; guardar(); pintarLista(); window.scrollTo(0,0);
    toast("Sesión guardada: "+c.P+" presentes, "+c.A+" ausentes"+(c.N?", "+c.N+" sin marcar":"")+".");
    if(hojaConfigurada()) sincronizar(true);
  });

  document.getElementById("lh-cat").addEventListener("change", pintarHistorial);
  document.getElementById("lh-sync").addEventListener("click", function(){ sincronizar(false); });
  document.getElementById("lh-lista").addEventListener("click", function(e){
    var a=e.target.closest("button[data-abrir]");
    if(a){ S.lista.actual=a.dataset.abrir; guardar(); irListaTab("pasar"); window.scrollTo(0,0); return; }
    var d=e.target.closest("button[data-borrar]");
    if(d){
      var s=sesPorId(d.dataset.borrar); if(!s) return;
      if(!confirm("¿Borrar la sesión «"+(s.titulo||nombreCat(s.cat))+"» del "+fechaLarga(s.fecha)+"? Se borrará también de la hoja de Google.")) return;
      S.lista.sesiones.splice(S.lista.sesiones.indexOf(s),1);
      if(S.lista.actual===s.id) S.lista.actual=null;
      if(s.sync) S.lista.borradas.push(s.id);
      guardar(); programarSync(); pintarHistorial(); pintarSync();
    }
  });

  document.getElementById("lt-cat").addEventListener("change", pintarTotales);
  document.getElementById("lt-busca").addEventListener("input", pintarTotales);
  document.getElementById("lt-excel").addEventListener("click", exportarExcel);
  document.getElementById("lt-puntos").addEventListener("click", function(){
    if(!S.lista.sesiones.length){ toast("Todavía no hay sesiones con puntos."); return; }
    S.puntosLista=true; guardar(); pintarCenso(); vista("puntos");
    toast("Puntos y créditos calculados con la asistencia.");
  });

  /* categorías */
  document.getElementById("lc-anadir").addEventListener("click", function(){
    var n=document.getElementById("lc-nombre"), p=document.getElementById("lc-puntos");
    if(anadirCategoria(n.value, parseFloat(p.value))){ n.value=""; p.value="1"; pintarLista(); }
  });
  document.getElementById("lc-nombre").addEventListener("keydown", function(e){ if(e.key==="Enter") document.getElementById("lc-anadir").click(); });
  document.getElementById("lc-lista").addEventListener("change", function(e){
    var fila=e.target.closest(".cat-fila"); if(!fila) return;
    var c=catPorId(fila.dataset.id); if(!c) return;
    if(e.target.dataset.f==="nombre"){
      var v=e.target.value.trim();
      if(!v){ e.target.value=c.nombre; return; }
      c.nombre=v;
    } else if(e.target.dataset.f==="puntos"){
      c.puntos=redondear(Math.max(0, parseFloat(e.target.value)||0)); e.target.value=c.puntos;
    }
    tocarCat(c);
  });
  document.getElementById("lc-lista").addEventListener("click", function(e){
    var b=e.target.closest("button[data-del-cat]"); if(!b) return;
    var c=catPorId(b.dataset.delCat); if(!c) return;
    var n=S.lista.sesiones.filter(function(x){ return x.cat===c.id; }).length;
    if(n){ toast("«"+c.nombre+"» tiene "+n+" sesión"+(n===1?"":"es")+": bórralas primero en «Sesiones».", "mal"); return; }
    if(!confirm("¿Borrar la categoría «"+c.nombre+"»?")) return;
    S.lista.categorias.splice(S.lista.categorias.indexOf(c),1);
    if(c.sync) S.lista.catBorradas.push(c.id);
    guardar(); programarSync(); pintarLista();
  });

  /* hoja de Google */
  var iu=document.getElementById("hs-url"), it=document.getElementById("hs-token"), ia=document.getElementById("hs-auto");
  iu.addEventListener("input", function(){ S.ajustes.sheets.url=iu.value.trim(); guardar(); pintarSync(); });
  it.addEventListener("input", function(){ S.ajustes.sheets.token=it.value; guardar(); pintarSync(); });
  ia.addEventListener("change", function(){ S.ajustes.sheets.auto=ia.checked; guardar(); });
  function estadoHoja(txt, mal){ var e=document.getElementById("hs-estado"); e.textContent=txt; e.style.color = mal ? "var(--carmin)" : ""; }
  document.getElementById("hs-probar").addEventListener("click", function(){
    estadoHoja("Probando…");
    hojaLlamar("ping").then(function(r){ estadoHoja("Conectado con la hoja «"+(r.hoja||"sin nombre")+"»."); })
      .catch(function(err){ estadoHoja(err.message, true); });
  });
  document.getElementById("hs-sync").addEventListener("click", function(){
    estadoHoja("Sincronizando…");
    sincronizar(false).then(function(ok){ estadoHoja(ok ? "Sincronizado." : (SYNC.error||""), !ok); });
  });
  document.getElementById("hs-censo-bajar").addEventListener("click", function(){ censoDesdeHoja(); });
  document.getElementById("hs-censo-subir").addEventListener("click", function(){
    if(!S.censo.length){ estadoHoja("No hay censo que subir.", true); return; }
    if(!confirm("Se escribirá el censo ("+S.censo.length+" colegiales) en la pestaña «Censo» de tu hoja, sustituyendo lo que haya. ¿Continuar?")) return;
    var valores=[["Apellido 1","Apellido 2","Nombre","Teléfono","Habitación","DNI","Email","Estudios"]].concat(S.censo.map(function(p){
      return [p.a1, p.a2, p.nom, p.tel, p.hab, p.dni, p.email, p.estudios];
    }));
    estadoHoja("Subiendo el censo…");
    hojaLlamar("censo_escribir", { valores:valores }).then(function(){ estadoHoja("Censo subido a la pestaña «Censo»."); })
      .catch(function(err){ estadoHoja(err.message, true); });
  });
  document.getElementById("hs-copiar-codigo").addEventListener("click", function(){
    var b=this;
    fetch("apps-script/Code.gs").then(function(r){ if(!r.ok) throw new Error(); return r.text(); }).then(function(t){
      var ok=function(){ var x=b.textContent; b.textContent="Copiado ✓"; setTimeout(function(){ b.textContent=x; },1800); };
      if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, function(){ fallback(t, ok); });
      else fallback(t, ok);
    }).catch(function(){ window.open("apps-script/Code.gs", "_blank", "noopener"); });
  });

  /* copia de seguridad */
  document.getElementById("lb-bajar").addEventListener("click", function(){
    var datos={ app:"secretaria-nebrija", version:1, exportado:new Date().toISOString(), lista:S.lista };
    descargarBlob(new Blob([JSON.stringify(datos)], { type:"application/json" }), "pasar-lista-"+hoyISO()+".json");
  });
  document.getElementById("lb-subir").addEventListener("click", function(){ document.getElementById("lb-file").click(); });
  document.getElementById("lb-file").addEventListener("change", function(){
    var f=this.files[0]; this.value=""; if(!f) return;
    f.text().then(function(t){
      var d=JSON.parse(t);
      if(!d || d.app!=="secretaria-nebrija" || !d.lista || !Array.isArray(d.lista.sesiones) || !Array.isArray(d.lista.categorias)) throw new Error("formato");
      if(!confirm("Se sustituirán las categorías y sesiones de este dispositivo por las de la copia ("+d.lista.sesiones.length+" sesiones). ¿Continuar?")) return;
      var l=Object.assign(listaVacia(), d.lista);
      l.actual=null;
      l.sesiones.forEach(function(x){ x.sync=0; x.mod=Date.now(); });
      l.categorias.forEach(function(c){ c.sync=0; c.mod=Date.now(); });
      S.lista=l; guardar(); programarSync(); pintarLista(); toast("Copia recuperada.");
    }).catch(function(){ toast("Ese archivo no es una copia válida de «Pasar lista».", "mal"); });
  });

  window.addEventListener("online", function(){ if(hojaConfigurada() && S.ajustes.sheets.auto) sincronizar(true); else pintarSync(); });
  window.addEventListener("offline", pintarSync);
  document.addEventListener("visibilitychange", function(){
    if(document.visibilityState==="visible" && hojaConfigurada() && S.ajustes.sheets.auto && !SYNC.trabajando && Date.now()-SYNC.ultimo>60000) sincronizar(true);
  });
})();

/* ---------- censo desde la hoja / datos de ejemplo ---------- */
function censoDesdeHoja(){
  if(!hojaConfigurada()){
    toast("Primero conecta tu hoja de Google.");
    vista("lista"); irListaTab("ajustes"); return Promise.resolve(false);
  }
  toast("Leyendo el censo de la hoja…");
  return hojaLlamar("censo_leer").then(function(r){
    var filas=filasDeHoja(r.valores||[]);
    if(!filas.length) throw new Error("No he encontrado colegiales en la pestaña «Censo» de la hoja (¿tiene cabeceras como Apellidos, Nombre, Habitación…?).");
    if(S.censo.length && !confirm("La hoja trae "+filas.length+" colegiales. ¿Sustituir el censo actual ("+S.censo.length+")?")) return false;
    S.censo=filas; S.origen="hoja"; S.sel={}; guardar(); pintarCenso();
    toast(filas.length+" colegiales cargados desde la hoja."); return true;
  }).catch(function(err){ toast(err.message, "mal"); return false; });
}
function ejemploCenso(){
  var nombres=["Lucía","Martín","Carmen","Hugo","Paula","Daniel","Sara","Álvaro","Marta","Pablo","Elena","Javier","Irene","Adrián","Noelia","Sergio","Claudia","Iván","Laura","Mario"];
  var ap1=["García","Martínez","López","Sánchez","Pérez","Gómez","Ruiz","Díaz","Moreno","Álvarez"];
  var ap2=["Fernández","Romero","Navarro","Torres","Domínguez","Vázquez","Ramos","Gil","Serrano","Blanco"];
  var hab=[1,2,3,4,5,6,7,10,11,12,13,14,15,20,21,40,41,42,43,44];
  var estudios=["Derecho","Medicina","Ingeniería","Psicología","Economía"];
  return nombres.map(function(n,i){
    var num=10000000+i*1234567;
    var dni=String(num)+LETRAS[num%23];
    return { a1:ap1[i%10], a2:ap2[(i*3)%10], nom:n, tel:"6000000"+(10+i), hab:String(hab[i]), dni:dni,
             email:"ejemplo"+(i+1)+"@example.com", estudios:estudios[i%5], puntos:"" };
  });
}
function cargarEjemplo(){
  if(S.censo.length && S.origen!=="ejemplo" && !confirm("Esto sustituye el censo actual por 20 colegiales inventados. ¿Continuar?")) return;
  S.censo=ejemploCenso(); S.origen="ejemplo"; S.sel={}; guardar(); pintarCenso();
  toast("Cargados 20 colegiales de ejemplo (datos inventados).");
}
function accionCenso(que){
  if(que==="fichero") document.getElementById("file-censo").click();
  else if(que==="hoja") censoDesdeHoja();
  else if(que==="ejemplo") cargarEjemplo();
}

["q-t1","q-t2","q-t3","q-pie","q-url"].forEach(function(id){
  document.getElementById(id).addEventListener("input", actualizarCartel);
});
document.getElementById("q-preset").addEventListener("change", function(){
  var p=PRESETS[this.value];
  document.getElementById("q-t1").value=p.t1; document.getElementById("q-t2").value=p.t2;
  document.getElementById("q-t3").value=p.t3; document.getElementById("q-pie").value=p.pie;
  var u=S.ajustes.campos["q-url:"+this.value];
  document.getElementById("q-url").value = u!==undefined ? u : p.url;
  ["q-t1","q-t2","q-t3","q-pie"].forEach(function(id){ S.ajustes.campos[id]=document.getElementById(id).value; });
  guardar();
  actualizarCartel();
});

cargar();
restaurarCampos();
pintarCenso();
actualizarCartel();
pintarClupik();
var inicial=(location.hash||"").replace("#","");
vista(inicial && document.getElementById("v-"+inicial) ? inicial : "resumen");
etiquetarTablas();
if(hojaConfigurada() && S.ajustes.sheets.auto) setTimeout(function(){ sincronizar(true); }, 1200);

})();
