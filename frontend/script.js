
"use strict";

/* =========================================
   ALERTA HUAYCO 2026
   PANEL CIUDADANO COMPLETO
========================================= */

const SUPABASE_URL =
  "https://lcfjfaicjyjgeskcvsbw.supabase.co";

const SUPABASE_PUBLIC_KEY =
  "sb_publishable__zzMDqsr5LJv98Bd2NBeXg_xoYMHLWi";

const db = window.supabase?.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLIC_KEY
);

const $ = id => document.getElementById(id);

let ciudadano = null;
let sesionActual = null;
let mapaCiudadano = null;
let capaReportes = null;
let capaRefugios = null;
let marcadorSeleccionado = null;
let canalTiempoReal = null;

const BUCKET_EVIDENCIAS = "evidencias-huaycos";
const MAX_FOTOS = 3;
const MAX_BYTES_FOTO = 5 * 1024 * 1024;
const MIME_PERMITIDOS = new Set(["image/jpeg", "image/png", "image/webp"]);
let urlsVistaPrevia = [];

function archivosEvidencia() {
  return Array.from($("reporteEvidencias")?.files || []);
}

function validarEvidencias(archivos) {
  if (archivos.length > MAX_FOTOS) {
    throw new Error("Selecciona un máximo de 3 fotografías.");
  }
  for (const archivo of archivos) {
    if (!MIME_PERMITIDOS.has(archivo.type)) {
      throw new Error("Solo se aceptan fotografías JPG, PNG o WEBP.");
    }
    if (archivo.size > MAX_BYTES_FOTO) {
      throw new Error("Cada fotografía debe pesar como máximo 5 MB.");
    }
  }
}

function limpiarPrevisualizaciones() {
  for (const url of urlsVistaPrevia) URL.revokeObjectURL(url);
  urlsVistaPrevia = [];
  $("vistaPreviaEvidencias")?.replaceChildren();
}

function actualizarPrevisualizaciones() {
  limpiarPrevisualizaciones();
  const archivos = archivosEvidencia();
  try { validarEvidencias(archivos); }
  catch (error) {
    $("reporteEvidencias").value = "";
    mostrarMensaje(errorTexto(error), true);
    return;
  }
  const contenedor = $("vistaPreviaEvidencias");
  for (const archivo of archivos) {
    const figura = document.createElement("figure");
    const imagen = document.createElement("img");
    const url = URL.createObjectURL(archivo);
    urlsVistaPrevia.push(url);
    imagen.src = url;
    imagen.alt = "Vista previa de " + archivo.name;
    const pie = crear("figcaption", archivo.name);
    figura.append(imagen, pie);
    contenedor.append(figura);
  }
}

async function subirEvidencias(reporteId, archivos) {
  const fallidas = [];
  let subidas = 0;
  for (const archivo of archivos) {
    const extension = {"image/jpeg":"jpg", "image/png":"png", "image/webp":"webp"}[archivo.type];
    const ruta = `${ciudadano.id}/${crypto.randomUUID()}.${extension}`;
    try {
      const { error: errorArchivo } = await db.storage
        .from(BUCKET_EVIDENCIAS)
        .upload(ruta, archivo, { contentType: archivo.type, upsert: false });
      if (errorArchivo) throw errorArchivo;
      const { error: errorRegistro } = await db
        .from("evidencias_reportes")
        .insert({ reporte_id: reporteId, usuario_id: ciudadano.id,
                  ruta_archivo: ruta, nombre_archivo: archivo.name });
      if (errorRegistro) {
        await db.storage.from(BUCKET_EVIDENCIAS).remove([ruta]);
        throw errorRegistro;
      }
      subidas++;
    } catch (error) {
      console.error("No se pudo guardar evidencia:", error);
      fallidas.push(archivo.name + ": " + errorTexto(error));
    }
  }
  return { subidas, fallidas };
}

async function agregarGaleriasEvidencias(reportes, tarjetas) {
  if (!reportes.length) return;
  const { data, error } = await db.from("evidencias_reportes")
    .select("reporte_id,ruta_archivo,nombre_archivo")
    .in("reporte_id", reportes.map(r => r.id));
  if (error) { console.warn("No se pudieron consultar las evidencias:", error); return; }
  const porReporte = new Map();
  for (const evidencia of data || []) {
    if (!porReporte.has(evidencia.reporte_id)) porReporte.set(evidencia.reporte_id, []);
    porReporte.get(evidencia.reporte_id).push(evidencia);
  }
  for (const [reporteId, evidencias] of porReporte) {
    const tarjeta = tarjetas.get(reporteId);
    if (!tarjeta) continue;
    const galeria = crear("div", "", "galeria-evidencias");
    tarjeta.append(crear("p", "📷 Evidencias fotográficas:"), galeria);
    const rutas = evidencias.map(e => e.ruta_archivo);
    const { data: firmadas, error: errorFirmas } = await db.storage
      .from(BUCKET_EVIDENCIAS).createSignedUrls(rutas, 600);
    if (errorFirmas) { galeria.append(crear("small", "No se pudieron abrir las fotos.")); continue; }
    (firmadas || []).forEach((firma, indice) => {
      if (!firma.signedUrl) return;
      const enlace = document.createElement("a");
      enlace.href = firma.signedUrl;
      enlace.target = "_blank";
      enlace.rel = "noopener noreferrer";
      const imagen = document.createElement("img");
      imagen.src = firma.signedUrl;
      imagen.loading = "lazy";
      imagen.alt = evidencias[indice].nombre_archivo || "Fotografía del reporte";
      enlace.append(imagen);
      galeria.append(enlace);
    });
  }
}

const CENTRO_CHOSICA = [-11.94, -76.70];

function crear(tag, contenido = "", clase = "") {
  const elemento = document.createElement(tag);
  elemento.textContent = String(contenido ?? "");
  if (clase) elemento.className = clase;
  return elemento;
}

function errorTexto(error) {
  return error?.message || String(error);
}

function mostrarMensaje(texto, error = false) {
  const caja = $("mensaje");

  if (caja) {
    caja.textContent = texto;
    caja.style.color = error ? "#b91c1c" : "#166534";
  }

  console[error ? "error" : "log"](texto);
}

function fechaBonita(valor) {
  if (!valor) return "Sin fecha";
  return new Date(valor).toLocaleString("es-PE");
}

function coordenadasValidas(lat, lon) {
  return lat !== null &&
    lat !== undefined &&
    lon !== null &&
    lon !== undefined &&
    lat !== "" &&
    lon !== "" &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lon)) &&
    Number(lat) >= -90 &&
    Number(lat) <= 90 &&
    Number(lon) >= -180 &&
    Number(lon) <= 180;
}

/* =========================================
   VISTAS Y SESIÓN
========================================= */

function mostrarAcceso() {
  $("accesoCiudadano").hidden = false;
  $("panelCiudadano").hidden = true;
  $("registro").hidden = false;
  $("login").hidden = false;
}

function mostrarPanel(nombre) {
  $("accesoCiudadano").hidden = true;
  $("panelCiudadano").hidden = false;
  $("nombreCiudadano").textContent =
    nombre || "Ciudadano";
}

function prepararCambiarCuenta() {
  let boton = $("btnCambiarCuenta");

  if (!boton) {
    boton = crear(
      "button",
      "Cerrar sesión y usar otra cuenta"
    );

    boton.id = "btnCambiarCuenta";
    boton.type = "button";

    $("contenedorAcceso").append(boton);

    boton.addEventListener("click", cerrarSesion);
  }

  boton.hidden = !sesionActual;
}

async function obtenerPerfil(usuario) {
  const { data: perfil, error } = await db
    .from("usuarios")
    .select("nombre, rol_id")
    .eq("id", usuario.id)
    .maybeSingle();

  if (error) throw error;

  if (!perfil) {
    throw new Error(
      "No se encontró tu perfil en la tabla usuarios."
    );
  }

  const { data: rol, error: errorRol } = await db
    .from("roles")
    .select("nombre")
    .eq("id", perfil.rol_id)
    .single();

  if (errorRol) throw errorRol;

  return {
    nombre: perfil.nombre,
    rol: String(rol.nombre).toUpperCase()
  };
}

/* =========================================
   REGISTRO
========================================= */

async function registrar(evento) {
  evento.preventDefault();

  const nombre = $("nombre").value.trim();
  const correo = $("correo").value.trim();
  const password = $("contrasena").value;

  if (!nombre || !correo || password.length < 8) {
    mostrarMensaje(
      "Completa los datos. La contraseña debe tener al menos 8 caracteres.",
      true
    );
    return;
  }

  const boton = $("formRegistro")
    .querySelector('[type="submit"]');

  boton.disabled = true;

  try {
    const { data: actual, error: errorSesion } =
      await db.auth.getSession();

    if (errorSesion) throw errorSesion;

    if (actual.session) {
      sesionActual = actual.session;
      prepararCambiarCuenta();

      throw new Error(
        "Primero cierra la sesión actual para crear otra cuenta."
      );
    }

    const { data, error } = await db.auth.signUp({
      email: correo,
      password,
      options: {
        data: { nombre }
      }
    });

    if (error) throw error;

    $("formRegistro").reset();

    if (data.session) {
      sesionActual = data.session;
      prepararCambiarCuenta();

      await verificarUsuario(true);
    } else {
      mostrarMensaje(
        "Cuenta registrada. Confirma tu correo si se solicita y luego inicia sesión."
      );
    }

  } catch (error) {
    mostrarMensaje(errorTexto(error), true);
  } finally {
    boton.disabled = false;
  }
}

/* =========================================
   INICIAR SESIÓN
========================================= */

async function iniciarSesion(evento) {
  evento.preventDefault();

  const boton = $("formLogin")
    .querySelector('[type="submit"]');

  boton.disabled = true;

  try {
    const { data, error } =
      await db.auth.signInWithPassword({
        email: $("loginCorreo").value.trim(),
        password: $("loginContrasena").value
      });

    if (error) throw error;

    sesionActual = data.session;
    $("formLogin").reset();

    await verificarUsuario(true);

  } catch (error) {
    mostrarMensaje(errorTexto(error), true);
  } finally {
    boton.disabled = false;
  }
}

async function verificarUsuario(redirigir = true) {
  const { data, error } = await db.auth.getUser();

  if (error) throw error;

  if (!data.user) {
    mostrarAcceso();
    return;
  }

  const perfil = await obtenerPerfil(data.user);

  if (perfil.rol === "SUPERVISOR") {
    if (redirigir) {
      location.href = "supervisor.html";
    } else {
      mostrarAcceso();
      prepararCambiarCuenta();

      mostrarMensaje(
        "Hay una sesión de supervisor guardada. Puedes cerrarla para usar otra cuenta."
      );
    }
    return;
  }

  if (perfil.rol !== "CIUDADANO") {
    throw new Error("Rol no autorizado.");
  }

  ciudadano = data.user;
  mostrarPanel(perfil.nombre);

  // El mapa se crea solo cuando el panel
  // ya está visible.
  prepararMapaCiudadano();

  await Promise.all([
    cargarMisReportes(),
    cargarAlertasCiudadano(),
    cargarRefugiosCiudadano()
  ]);

  iniciarTiempoReal();

  mostrarMensaje("Bienvenido, " + perfil.nombre);
}

/* =========================================
   MAPA INTERACTIVO CORREGIDO
========================================= */

function prepararMapaCiudadano() {
  if (!window.L) {
    mostrarMensaje(
      "No se pudo cargar el mapa. Comprueba tu conexión.",
      true
    );
    return;
  }

  const contenedor = $("mapaCiudadano");

  if (!contenedor) return;

  if (mapaCiudadano) {
    setTimeout(() => {
      mapaCiudadano.invalidateSize(true);
    }, 200);
    return;
  }

  mapaCiudadano = L.map(contenedor, {
    center: CENTRO_CHOSICA,
    zoom: 12,
    zoomControl: true
  });

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }
  ).addTo(mapaCiudadano);

  capaReportes = L.featureGroup()
    .addTo(mapaCiudadano);

  capaRefugios = L.featureGroup()
    .addTo(mapaCiudadano);

  // Seleccionar la ubicación del reporte.
  mapaCiudadano.on("click", evento => {
    seleccionarUbicacion(
      evento.latlng.lat,
      evento.latlng.lng
    );
  });

  // Esperar a que el navegador termine
  // de dibujar el panel.
  requestAnimationFrame(() => {
    setTimeout(() => {
      mapaCiudadano.invalidateSize(true);
      mapaCiudadano.setView(CENTRO_CHOSICA, 12);
    }, 250);
  });
}

function seleccionarUbicacion(lat, lon) {
  if (!mapaCiudadano) return;

  const latitud = Number(lat.toFixed(6));
  const longitud = Number(lon.toFixed(6));

  $("reporteLatitud").value = latitud;
  $("reporteLongitud").value = longitud;

  $("ubicacionSeleccionada").textContent =
    "📍 Ubicación seleccionada: " +
    latitud + ", " + longitud;

  if (marcadorSeleccionado) {
    mapaCiudadano.removeLayer(marcadorSeleccionado);
  }

  marcadorSeleccionado = L.marker(
    [latitud, longitud]
  ).addTo(mapaCiudadano);

  const popup = document.createElement("div");
  popup.append(
    crear("strong", "Ubicación del nuevo reporte"),
    crear("p", latitud + ", " + longitud)
  );

  marcadorSeleccionado
    .bindPopup(popup)
    .openPopup();
}

function limpiarUbicacionSeleccionada() {
  if (marcadorSeleccionado && mapaCiudadano) {
    mapaCiudadano.removeLayer(marcadorSeleccionado);
    marcadorSeleccionado = null;
  }

  $("ubicacionSeleccionada").textContent =
    "📍 Haz clic en un punto del mapa para seleccionar la ubicación.";
}

function actualizarMapaReportes(reportes) {
  if (!mapaCiudadano || !capaReportes) return;

  capaReportes.clearLayers();

  for (const reporte of reportes) {
    if (!coordenadasValidas(
      reporte.latitud,
      reporte.longitud
    )) continue;

    const marcador = L.circleMarker(
      [
        Number(reporte.latitud),
        Number(reporte.longitud)
      ],
      {
        radius: 9,
        color: "#c2410c",
        weight: 2,
        fillColor: "#f97316",
        fillOpacity: .85
      }
    );

    const popup = document.createElement("div");

    popup.append(
      crear("strong", "Reporte #" + reporte.id),
      crear("p", reporte.ubicacion),
      crear("p", "Estado: " + reporte.estado)
    );

    marcador.bindPopup(popup);
    marcador.addTo(capaReportes);
  }
}

/* =========================================
   ENVIAR REPORTE
========================================= */

async function enviarReporte(evento) {
  evento.preventDefault();

  if (!ciudadano) {
    mostrarMensaje(
      "Debes iniciar sesión como ciudadano.",
      true
    );
    return;
  }

  const descripcion =
    $("reporteDescripcion").value.trim();

  const ubicacion =
    $("reporteUbicacion").value.trim();

  const latTexto =
    $("reporteLatitud").value.trim();

  const lonTexto =
    $("reporteLongitud").value.trim();

  const latitud = latTexto === ""
    ? null
    : Number(latTexto);

  const longitud = lonTexto === ""
    ? null
    : Number(lonTexto);

  if (descripcion.length < 10 || !ubicacion) {
    mostrarMensaje(
      "Escribe una descripción de al menos 10 caracteres y una ubicación.",
      true
    );
    return;
  }

  if (
    (latitud === null) !== (longitud === null)
  ) {
    mostrarMensaje(
      "Completa ambas coordenadas o deja las dos vacías.",
      true
    );
    return;
  }

  if (
    latitud !== null &&
    !coordenadasValidas(latitud, longitud)
  ) {
    mostrarMensaje(
      "Las coordenadas no son válidas.",
      true
    );
    return;
  }

  const boton = $("btnEnviarReporte");
  boton.disabled = true;

  try {
    const { data: auth, error: errorAuth } =
      await db.auth.getUser();

    if (
      errorAuth ||
      !auth.user ||
      auth.user.id !== ciudadano.id
    ) {
      throw new Error(
        "Tu sesión no es válida. Inicia sesión nuevamente."
      );
    }

    const archivos = archivosEvidencia();
    validarEvidencias(archivos);

    // Se necesita el ID del reporte para relacionar las fotografías.
    const { data: nuevoReporte, error } = await db
      .from("reportes")
      .insert({
        usuario_id: ciudadano.id,
        descripcion,
        ubicacion,
        latitud,
        longitud,
        estado: "PENDIENTE"
      })
      .select("id")
      .single();

    if (error) throw error;

    const resultado = await subirEvidencias(nuevoReporte.id, archivos);
    $("formReporte").reset();
    limpiarPrevisualizaciones();
    limpiarUbicacionSeleccionada();

    if (resultado.fallidas.length) {
      mostrarMensaje(
        `Reporte #${nuevoReporte.id} guardado. Fotos guardadas: ${resultado.subidas}/${archivos.length}. ` +
        "Algunas fotografías fallaron: " + resultado.fallidas.join(" | "), true
      );
    } else {
      mostrarMensaje(
        `Reporte #${nuevoReporte.id} enviado correctamente con ${resultado.subidas} foto(s).`
      );
    }

    await cargarMisReportes();

  } catch (error) {
    mostrarMensaje(errorTexto(error), true);
  } finally {
    boton.disabled = false;
  }
}

/* =========================================
   MIS REPORTES
========================================= */

async function cargarMisReportes() {
  if (!ciudadano) return;

  const lista = $("listaMisReportes");

  lista.replaceChildren(
    crear("p", "Cargando reportes...")
  );

  try {
    const { data, error } = await db
      .from("reportes")
      .select(
        "id, descripcion, ubicacion, latitud, " +
        "longitud, estado, fecha"
      )
      .eq("usuario_id", ciudadano.id)
      .order("fecha", { ascending: false })
      .limit(100);

    if (error) throw error;

    lista.replaceChildren();

    if (!data.length) {
      lista.append(
        crear("p", "Todavía no tienes reportes.")
      );
    }

    const tarjetas = new Map();
    for (const reporte of data) {
      const tarjeta = crear(
        "article",
        "",
        "tarjeta-reporte"
      );

      const estado = String(reporte.estado || "");

      const etiqueta = crear(
        "span",
        estado.replaceAll("_", " "),
        "status-pill " + estado.toLowerCase()
      );

      tarjeta.append(
        crear("h3", "📋 Reporte #" + reporte.id),
        etiqueta,
        crear("p", reporte.descripcion),
        crear("p", "📍 " + reporte.ubicacion),
        crear("small", fechaBonita(reporte.fecha))
      );

      if (
        coordenadasValidas(
          reporte.latitud,
          reporte.longitud
        ) &&
        mapaCiudadano
      ) {
        const botonMapa = crear(
          "button",
          "📍 Ver en el mapa",
          "outline-btn"
        );

        botonMapa.type = "button";

        botonMapa.addEventListener("click", () => {
          mapaCiudadano.invalidateSize(true);

          mapaCiudadano.setView(
            [
              Number(reporte.latitud),
              Number(reporte.longitud)
            ],
            15
          );

          $("mapaCiudadano").scrollIntoView({
            behavior: "smooth",
            block: "center"
          });
        });

        tarjeta.append(botonMapa);
      }

      lista.append(tarjeta);
      tarjetas.set(reporte.id, tarjeta);
    }

    await agregarGaleriasEvidencias(data, tarjetas);
    actualizarMapaReportes(data);

  } catch (error) {
    lista.replaceChildren(
      crear("p", "Error: " + errorTexto(error))
    );
  }
}

/* =========================================
   ALERTAS CIUDADANAS
========================================= */

async function cargarAlertasCiudadano() {
  const lista = $("alertasCiudadano");

  if (!lista) return;

  try {
    const { data, error } = await db
      .from("alertas")
      .select(
        "id, titulo, descripcion, ubicacion, " +
        "nivel_riesgo, estado, fecha"
      )
      .eq("estado", "ACTIVA")
      .order("fecha", { ascending: false })
      .limit(50);

    if (error) throw error;

    lista.replaceChildren();

    if (!data.length) {
      lista.append(
        crear("p", "No hay alertas activas.")
      );
    }

    for (const alerta of data) {
      const tarjeta = crear(
        "article",
        "",
        "tarjeta-reporte alerta-ciudadana"
      );

      tarjeta.append(
        crear("h3", "🚨 " + alerta.titulo),
        crear("p", alerta.descripcion),
        crear("p", "📍 " + alerta.ubicacion),
        crear(
          "p",
          "Nivel de riesgo: " + alerta.nivel_riesgo
        ),
        crear("small", fechaBonita(alerta.fecha))
      );

      lista.append(tarjeta);
    }

  } catch (error) {
    lista.replaceChildren(
      crear("p", "Error: " + errorTexto(error))
    );
  }
}

/* =========================================
   REFUGIOS TEMPORALES
========================================= */

async function cargarRefugiosCiudadano() {
  const lista = $("refugiosCiudadano");

  if (!lista) return;

  try {
    const { data, error } = await db
      .from("refugios_temporales")
      .select(
        "id, nombre, direccion, capacidad, " +
        "latitud, longitud, disponible"
      )
      .eq("disponible", true)
      .order("nombre")
      .limit(100);

    if (error) throw error;

    lista.replaceChildren();

    if (capaRefugios) {
      capaRefugios.clearLayers();
    }

    if (!data.length) {
      lista.append(
        crear("p", "No hay refugios disponibles.")
      );
    }

    for (const refugio of data) {
      const tarjeta = crear(
        "article",
        "",
        "tarjeta-reporte"
      );

      tarjeta.append(
        crear("h3", "🏠 " + refugio.nombre),
        crear(
          "p",
          "Dirección: " + refugio.direccion
        ),
        crear(
          "p",
          "Capacidad: " + refugio.capacidad
        ),
        crear(
          "span",
          "Disponible",
          "status-pill atendido"
        )
      );

      lista.append(tarjeta);

      if (
        mapaCiudadano &&
        capaRefugios &&
        coordenadasValidas(
          refugio.latitud,
          refugio.longitud
        )
      ) {
        const marcador = L.circleMarker(
          [
            Number(refugio.latitud),
            Number(refugio.longitud)
          ],
          {
            radius: 10,
            color: "#047857",
            fillColor: "#10b981",
            fillOpacity: .9
          }
        );

        const popup = document.createElement("div");

        popup.append(
          crear("strong", refugio.nombre),
          crear("p", refugio.direccion),
          crear(
            "p",
            "Capacidad: " + refugio.capacidad
          )
        );

        marcador.bindPopup(popup);
        marcador.addTo(capaRefugios);

        const boton = crear(
          "button",
          "🗺️ Ver refugio en el mapa",
          "outline-btn"
        );

        boton.type = "button";

        boton.addEventListener("click", () => {
          mapaCiudadano.invalidateSize(true);
          mapaCiudadano.setView(
            [
              Number(refugio.latitud),
              Number(refugio.longitud)
            ],
            15
          );

          marcador.openPopup();

          $("mapaCiudadano").scrollIntoView({
            behavior: "smooth",
            block: "center"
          });
        });

        tarjeta.append(boton);
      }
    }

  } catch (error) {
    lista.replaceChildren(
      crear("p", "Error: " + errorTexto(error))
    );
  }
}

/* =========================================
   ACTUALIZACIONES EN TIEMPO REAL
========================================= */

function iniciarTiempoReal() {
  if (!ciudadano || canalTiempoReal) return;

  canalTiempoReal = db
    .channel("ciudadano-" + ciudadano.id)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "alertas"
      },
      () => cargarAlertasCiudadano()
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "reportes",
        filter: "usuario_id=eq." + ciudadano.id
      },
      () => cargarMisReportes()
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "refugios_temporales"
      },
      () => cargarRefugiosCiudadano()
    )
    .subscribe();
}

/* =========================================
   CERRAR SESIÓN
========================================= */

async function cerrarSesion() {
  try {
    if (canalTiempoReal) {
      await db.removeChannel(canalTiempoReal);
      canalTiempoReal = null;
    }

    const { error } = await db.auth.signOut();

    if (error) throw error;

    ciudadano = null;
    sesionActual = null;

    // Destruir el mapa para poder
    // crearlo nuevamente al iniciar sesión.
    if (mapaCiudadano) {
      mapaCiudadano.remove();
      mapaCiudadano = null;
    }

    capaReportes = null;
    capaRefugios = null;
    marcadorSeleccionado = null;

    $("formReporte").reset();
    limpiarPrevisualizaciones();
    limpiarUbicacionSeleccionada();

    mostrarAcceso();
    prepararCambiarCuenta();

    mostrarMensaje(
      "Sesión cerrada. Puedes ingresar con otra cuenta."
    );

  } catch (error) {
    mostrarMensaje(errorTexto(error), true);
  }
}

/* =========================================
   INICIALIZACIÓN
========================================= */

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    mostrarAcceso();
    prepararCambiarCuenta();

    if (
      !db ||
      SUPABASE_PUBLIC_KEY ===
        "PEGA_AQUI_TU_CLAVE_PUBLICA"
    ) {
      mostrarMensaje(
        "Configura tu clave pública de Supabase en script.js.",
        true
      );
      return;
    }

    $("formRegistro").addEventListener(
      "submit",
      registrar
    );

    $("formLogin").addEventListener(
      "submit",
      iniciarSesion
    );

    $("formReporte").addEventListener(
      "submit",
      enviarReporte
    );

    $("reporteEvidencias").addEventListener(
      "change", actualizarPrevisualizaciones
    );

    $("btnActualizarReportes").addEventListener(
      "click",
      cargarMisReportes
    );

    $("btnCerrarSesionCiudadano").addEventListener(
      "click",
      cerrarSesion
    );

    // Sincronizar coordenadas escritas
    // manualmente con el marcador del mapa.
    function sincronizarCoordenadas() {
      const lat = $("reporteLatitud").value;
      const lon = $("reporteLongitud").value;

      if (coordenadasValidas(lat, lon)) {
        seleccionarUbicacion(
          Number(lat),
          Number(lon)
        );
      }
    }

    $("reporteLatitud").addEventListener(
      "change",
      sincronizarCoordenadas
    );

    $("reporteLongitud").addEventListener(
      "change",
      sincronizarCoordenadas
    );

    try {
      const { data, error } =
        await db.auth.getSession();

      if (error) throw error;

      sesionActual = data.session;
      prepararCambiarCuenta();

      if (sesionActual) {
        await verificarUsuario(true);
      }

    } catch (error) {
      mostrarMensaje(
        errorTexto(error),
        true
      );
    }
  }
);
