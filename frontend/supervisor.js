
"use strict";

/* ==========================================
   ALERTA HUAYCO 2026
   PANEL SUPERVISOR COMPLETO
========================================== */

const SUPABASE_URL =
  "https://lcfjfaicjyjgeskcvsbw.supabase.co";

const SUPABASE_PUBLIC_KEY =
  "sb_publishable__zzMDqsr5LJv98Bd2NBeXg_xoYMHLWi";

const db = window.supabase?.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLIC_KEY
);

let supervisor = null;
let mapaSupervisor = null;
let marcadoresSupervisor = null;
let reportesActuales = [];

const $ = id => document.getElementById(id);

function crear(tag, texto = "", clase = "") {
  const elemento = document.createElement(tag);
  elemento.textContent = String(texto ?? "");

  if (clase) {
    elemento.className = clase;
  }

  return elemento;
}

function mostrarMensaje(texto, error = false) {
  const caja = $("mensajeSupervisor");

  if (caja) {
    caja.textContent = texto;
    caja.style.color = error ? "#dc2626" : "#15803d";
  }

  console[error ? "error" : "log"](texto);
}

function textoError(error) {
  return error?.message || String(error);
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

/* ==========================================
   CONTROL DE ACCESO
========================================== */

async function verificarSupervisor() {
  try {
    const { data: auth, error: errorAuth } =
      await db.auth.getUser();

    if (errorAuth) throw errorAuth;

    if (!auth.user) {
      location.href = "index.html";
      return;
    }

    const { data: perfil, error: errorPerfil } =
      await db
        .from("usuarios")
        .select("nombre, rol_id")
        .eq("id", auth.user.id)
        .single();

    if (errorPerfil) throw errorPerfil;

    const { data: rol, error: errorRol } =
      await db
        .from("roles")
        .select("nombre")
        .eq("id", perfil.rol_id)
        .single();

    if (errorRol) throw errorRol;

    if (
      String(rol.nombre).toUpperCase() !== "SUPERVISOR"
    ) {
      $("pantallaCarga").textContent =
        "Acceso denegado: tu cuenta no es supervisor.";
      return;
    }

    supervisor = auth.user;

    $("nombreSupervisor").textContent =
      perfil.nombre || "Supervisor";

    $("pantallaCarga").hidden = true;
    $("panelSupervisor").hidden = false;

    mostrarSeccion("inicio");

    await Promise.all([
      cargarEstadisticas(),
      cargarAlertas(),
      cargarReportes(),
      cargarRefugios()
    ]);

  } catch (error) {
    $("pantallaCarga").textContent =
      "Error de acceso: " + textoError(error);

    mostrarMensaje(textoError(error), true);
  }
}

/* ==========================================
   NAVEGACIÓN
========================================== */

function mostrarSeccion(nombre) {
  const secciones = [
    "inicio",
    "alertas",
    "reportes",
    "refugios"
  ];

  for (const seccion of secciones) {
    const elemento = $("seccion-" + seccion);

    if (elemento) {
      elemento.hidden = seccion !== nombre;
    }
  }

  document.querySelectorAll(
    ".sidebar-nav button[data-seccion]"
  ).forEach(boton => {
    boton.classList.toggle(
      "activo",
      boton.dataset.seccion === nombre
    );
  });

  if (nombre === "inicio") {
    cargarEstadisticas();
  }

  if (nombre === "alertas") {
    cargarAlertas();
  }

  if (nombre === "reportes") {
    cargarReportes();

    // CORRECCIÓN DEL MAPA:
    // Leaflet debe calcular su tamaño cuando
    // la sección ya se encuentra visible.
    setTimeout(() => {
      prepararMapaSupervisor();

      if (mapaSupervisor) {
        mapaSupervisor.invalidateSize(true);

        if (marcadoresSupervisor &&
            marcadoresSupervisor.getLayers().length > 0) {
          mapaSupervisor.fitBounds(
            marcadoresSupervisor.getBounds(),
            {
              padding: [35, 35],
              maxZoom: 14
            }
          );
        } else {
          mapaSupervisor.setView(
            [-11.94, -76.70],
            12
          );
        }
      }
    }, 300);
  }

  if (nombre === "refugios") {
    cargarRefugios();
  }
}

/* ==========================================
   ESTADÍSTICAS
========================================== */

async function cargarEstadisticas() {
  const configuracion = [
    ["alertas", "totalAlertas"],
    ["reportes", "totalReportes"],
    ["refugios_temporales", "totalRefugios"]
  ];

  await Promise.all(
    configuracion.map(async ([tabla, id]) => {
      const caja = $(id);
      if (!caja) return;

      const { count, error } = await db
        .from(tabla)
        .select("*", {
          count: "exact",
          head: true
        });

      caja.textContent = error
        ? "—"
        : String(count ?? 0);
    })
  );
}

/* ==========================================
   ALERTAS
========================================== */

async function cargarAlertas() {
  const lista = $("listaAlertas");
  if (!lista) return;

  lista.replaceChildren(
    crear("p", "Cargando alertas...")
  );

  try {
    const { data, error } = await db
      .from("alertas")
      .select(
        "id, titulo, descripcion, ubicacion, " +
        "nivel_riesgo, estado, fecha"
      )
      .order("fecha", { ascending: false })
      .limit(100);

    if (error) throw error;

    lista.replaceChildren();

    if (!data.length) {
      lista.append(
        crear("p", "No hay alertas registradas.")
      );
      return;
    }

    for (const alerta of data) {
      const tarjeta = crear(
        "article",
        "",
        "tarjeta-alerta"
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

      const selector = document.createElement("select");

      for (const estado of [
        "ACTIVA",
        "EN_REVISION",
        "RESUELTA"
      ]) {
        selector.add(
          new Option(
            estado.replaceAll("_", " "),
            estado
          )
        );
      }

      selector.value = alerta.estado;

      const boton = crear(
        "button",
        "Guardar estado"
      );

      boton.type = "button";

      boton.addEventListener("click", async () => {
        boton.disabled = true;

        try {
          const { data: actualizado, error } =
            await db
              .from("alertas")
              .update({
                estado: selector.value
              })
              .eq("id", alerta.id)
              .select("id");

          if (error) throw error;

          if (!actualizado?.length) {
            throw new Error(
              "No se pudo actualizar la alerta."
            );
          }

          mostrarMensaje(
            "Estado de alerta actualizado."
          );

          await cargarAlertas();

        } catch (error) {
          mostrarMensaje(
            textoError(error),
            true
          );
        } finally {
          boton.disabled = false;
        }
      });

      tarjeta.append(selector, boton);
      lista.append(tarjeta);
    }

  } catch (error) {
    lista.replaceChildren(
      crear("p", textoError(error))
    );
  }
}

async function crearAlerta(evento) {
  evento.preventDefault();

  if (!supervisor) return;

  const titulo = $("alertaTitulo").value.trim();
  const descripcion =
    $("alertaDescripcion").value.trim();
  const ubicacion =
    $("alertaUbicacion").value.trim();
  const nivel_riesgo = $("alertaRiesgo").value;

  if (!titulo || !descripcion || !ubicacion) {
    mostrarMensaje(
      "Completa todos los campos.",
      true
    );
    return;
  }

  try {
    const { error } = await db
      .from("alertas")
      .insert({
        titulo,
        descripcion,
        ubicacion,
        nivel_riesgo,
        estado: "ACTIVA",
        creado_por: supervisor.id
      });

    if (error) throw error;

    $("formNuevaAlerta").reset();
    $("formNuevaAlerta").hidden = true;

    mostrarMensaje(
      "Alerta publicada correctamente."
    );

    await Promise.all([
      cargarAlertas(),
      cargarEstadisticas()
    ]);

  } catch (error) {
    mostrarMensaje(
      textoError(error),
      true
    );
  }
}

/* ==========================================
   EVIDENCIAS PRIVADAS DEL SUPERVISOR
========================================== */
const BUCKET_EVIDENCIAS = "evidencias-huaycos";
async function obtenerEvidenciasReportes(reportes) {
  const agrupadas = new Map();
  if (!reportes.length) return agrupadas;
  const { data, error } = await db.from("evidencias_reportes")
    .select("reporte_id,ruta_archivo,nombre_archivo")
    .in("reporte_id", reportes.map(r => r.id));
  if (error) throw error;
  for (const e of data || []) {
    if (!agrupadas.has(e.reporte_id)) agrupadas.set(e.reporte_id, []);
    agrupadas.get(e.reporte_id).push(e);
  }
  return agrupadas;
}
async function agregarGaleriaSupervisor(tarjeta, evidencias) {
  const panel = crear("div", "", "evidence-panel");
  panel.append(crear("h4", "📸 Evidencias fotográficas"));
  tarjeta.append(panel);
  if (!evidencias.length) {
    panel.append(crear("p", "Sin fotografías adjuntas.", "evidence-empty"));
    return;
  }
  const galeria = crear("div", "", "evidence-gallery");
  panel.append(galeria);
  const { data, error } = await db.storage.from(BUCKET_EVIDENCIAS)
    .createSignedUrls(evidencias.map(e => e.ruta_archivo), 3600);
  if (error) {
    galeria.append(crear("p", "No se pudieron abrir las fotos: " + textoError(error), "evidence-empty"));
    return;
  }
  (data || []).forEach((firma, i) => {
    if (!firma.signedUrl) {
      galeria.append(crear("p", "Fotografía no disponible", "evidence-empty"));
      return;
    }
    const enlace = document.createElement("a");
    enlace.href = firma.signedUrl;
    enlace.target = "_blank";
    enlace.rel = "noopener noreferrer";
    const img = document.createElement("img");
    img.src = firma.signedUrl;
    img.alt = evidencias[i].nombre_archivo || "Fotografía del reporte";
    img.loading = "lazy";
    enlace.append(img);
    galeria.append(enlace);
  });
}

/* ==========================================
   REPORTES CIUDADANOS
========================================== */

async function cargarReportes() {
  const lista = $("listaReportes");
  if (!lista) return;

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
      .order("fecha", { ascending: false })
      .limit(100);

    if (error) throw error;

    reportesActuales = data || [];
    let evidenciasAgrupadas = new Map();
    let errorEvidencias = null;
    try { evidenciasAgrupadas = await obtenerEvidenciasReportes(reportesActuales); }
    catch (e) { errorEvidencias = e; console.error(e); }

    lista.replaceChildren();

    if (!reportesActuales.length) {
      lista.append(
        crear("p", "No hay reportes ciudadanos.")
      );
    }

    for (const reporte of reportesActuales) {
      const tarjeta = crear(
        "article",
        "",
        "tarjeta-reporte"
      );

      tarjeta.append(
        crear("h3", "Reporte #" + reporte.id),
        crear("p", reporte.descripcion),
        crear("p", "📍 " + reporte.ubicacion),
        crear(
          "p",
          "Estado: " + reporte.estado
        ),
        crear(
          "small",
          fechaBonita(reporte.fecha)
        )
      );

      if (errorEvidencias) {
        const aviso = crear("div", "", "evidence-panel");
        aviso.append(crear("p", "No se pudieron consultar las fotografías: " + textoError(errorEvidencias), "evidence-empty"));
        tarjeta.append(aviso);
      } else {
        await agregarGaleriaSupervisor(tarjeta, evidenciasAgrupadas.get(reporte.id) || []);
      }

      const selector = document.createElement("select");

      for (const estado of [
        "PENDIENTE",
        "EN_REVISION",
        "ATENDIDO",
        "DESCARTADO"
      ]) {
        selector.add(
          new Option(
            estado.replaceAll("_", " "),
            estado
          )
        );
      }

      selector.value = reporte.estado;

      const boton = crear(
        "button",
        "Actualizar estado"
      );

      boton.type = "button";

      boton.addEventListener("click", async () => {
        boton.disabled = true;

        try {
          const { data: actualizado, error } =
            await db
              .from("reportes")
              .update({
                estado: selector.value
              })
              .eq("id", reporte.id)
              .select("id");

          if (error) throw error;

          if (!actualizado?.length) {
            throw new Error(
              "No se pudo actualizar el reporte."
            );
          }

          mostrarMensaje(
            "Reporte actualizado correctamente."
          );

          await cargarReportes();

        } catch (error) {
          mostrarMensaje(
            textoError(error),
            true
          );
        } finally {
          boton.disabled = false;
        }
      });

      tarjeta.append(selector, boton);
      lista.append(tarjeta);
    }

    actualizarMapaSupervisor(reportesActuales);

  } catch (error) {
    lista.replaceChildren(
      crear("p", textoError(error))
    );
  }
}

/* ==========================================
   MAPA INTERACTIVO CORREGIDO
========================================== */

function prepararMapaSupervisor() {
  if (!window.L) {
    mostrarMensaje(
      "No se pudo cargar Leaflet.",
      true
    );
    return;
  }

  if (mapaSupervisor) {
    mapaSupervisor.invalidateSize(true);
    return;
  }

  const contenedor = $("mapaSupervisor");

  if (!contenedor) return;

  mapaSupervisor = L.map(contenedor, {
    center: [-11.94, -76.70],
    zoom: 12,
    zoomControl: true
  });

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }
  ).addTo(mapaSupervisor);

  marcadoresSupervisor =
    L.featureGroup().addTo(mapaSupervisor);

  actualizarMapaSupervisor(reportesActuales);

  setTimeout(() => {
    mapaSupervisor.invalidateSize(true);
  }, 300);
}

function actualizarMapaSupervisor(reportes) {
  if (!mapaSupervisor || !marcadoresSupervisor) {
    return;
  }

  marcadoresSupervisor.clearLayers();

  for (const reporte of reportes) {
    if (!coordenadasValidas(
      reporte.latitud,
      reporte.longitud
    )) {
      continue;
    }

    const marcador = L.circleMarker(
      [
        Number(reporte.latitud),
        Number(reporte.longitud)
      ],
      {
        radius: 9,
        color: "#b91c1c",
        weight: 2,
        fillColor: "#f97316",
        fillOpacity: 0.85
      }
    );

    const contenido = document.createElement("div");

    contenido.append(
      crear("strong", "Reporte #" + reporte.id),
      crear("p", reporte.ubicacion),
      crear("p", "Estado: " + reporte.estado)
    );

    marcador.bindPopup(contenido);
    marcador.addTo(marcadoresSupervisor);
  }

  // Si hay reportes con coordenadas,
  // encuadrar los marcadores.
  if (marcadoresSupervisor.getLayers().length) {
    mapaSupervisor.fitBounds(
      marcadoresSupervisor.getBounds(),
      {
        padding: [35, 35],
        maxZoom: 14
      }
    );
  } else {
    mapaSupervisor.setView(
      [-11.94, -76.70],
      12
    );
  }
}

/* ==========================================
   REFUGIOS TEMPORALES
========================================== */

function crearFormularioRefugio() {
  const formulario = $("formNuevoRefugio");

  if (!formulario) return;

  formulario.addEventListener(
    "submit",
    guardarRefugio
  );
}

async function guardarRefugio(evento) {
  evento.preventDefault();

  if (!supervisor) return;

  const nombre = $("refNombre").value.trim();
  const direccion = $("refDireccion").value.trim();
  const capacidad = Number($("refCapacidad").value);

  const latTexto = $("refLatitud").value.trim();
  const lonTexto = $("refLongitud").value.trim();

  const latitud = latTexto
    ? Number(latTexto)
    : null;

  const longitud = lonTexto
    ? Number(lonTexto)
    : null;

  if (
    !nombre ||
    !direccion ||
    !Number.isInteger(capacidad) ||
    capacidad <= 0
  ) {
    mostrarMensaje(
      "Completa correctamente los datos del refugio.",
      true
    );
    return;
  }

  if (
    (latitud !== null &&
      (!Number.isFinite(latitud) ||
       Math.abs(latitud) > 90)) ||
    (longitud !== null &&
      (!Number.isFinite(longitud) ||
       Math.abs(longitud) > 180))
  ) {
    mostrarMensaje(
      "Coordenadas inválidas.",
      true
    );
    return;
  }

  try {
    const { error } = await db
      .from("refugios_temporales")
      .insert({
        nombre,
        direccion,
        capacidad,
        latitud,
        longitud,
        disponible: $("refDisponible").checked,
        registrado_por: supervisor.id
      });

    if (error) throw error;

    $("formNuevoRefugio").reset();
    $("formNuevoRefugio").hidden = true;

    mostrarMensaje(
      "Refugio registrado correctamente."
    );

    await Promise.all([
      cargarRefugios(),
      cargarEstadisticas()
    ]);

  } catch (error) {
    mostrarMensaje(
      textoError(error),
      true
    );
  }
}

async function cargarRefugios() {
  const lista = $("listaRefugios");
  if (!lista) return;

  lista.replaceChildren(
    crear("p", "Cargando refugios...")
  );

  try {
    const { data, error } = await db
      .from("refugios_temporales")
      .select(
        "id, nombre, direccion, capacidad, disponible"
      )
      .order("nombre")
      .limit(100);

    if (error) throw error;

    lista.replaceChildren();

    if (!data.length) {
      lista.append(
        crear("p", "No hay refugios registrados.")
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
          "p",
          refugio.disponible
            ? "Disponible"
            : "No disponible"
        )
      );

      const boton = crear(
        "button",
        refugio.disponible
          ? "Marcar no disponible"
          : "Marcar disponible"
      );

      boton.type = "button";

      boton.addEventListener("click", async () => {
        boton.disabled = true;

        try {
          const { data: actualizado, error } =
            await db
              .from("refugios_temporales")
              .update({
                disponible: !refugio.disponible
              })
              .eq("id", refugio.id)
              .select("id");

          if (error) throw error;

          if (!actualizado?.length) {
            throw new Error(
              "No se pudo actualizar el refugio."
            );
          }

          mostrarMensaje(
            "Disponibilidad actualizada."
          );

          await cargarRefugios();

        } catch (error) {
          mostrarMensaje(
            textoError(error),
            true
          );
        } finally {
          boton.disabled = false;
        }
      });

      tarjeta.append(boton);
      lista.append(tarjeta);
    }

  } catch (error) {
    lista.replaceChildren(
      crear("p", textoError(error))
    );
  }
}

/* ==========================================
   CERRAR SESIÓN
========================================== */

async function cerrarSesion() {
  const { error } = await db.auth.signOut();

  if (error) {
    mostrarMensaje(
      textoError(error),
      true
    );
    return;
  }

  location.href = "index.html";
}

/* ==========================================
   INICIALIZACIÓN
========================================== */

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    if (
      !db ||
      SUPABASE_PUBLIC_KEY ===
      "PEGA_AQUI_TU_CLAVE_PUBLICA"
    ) {
      $("pantallaCarga").textContent =
        "Configura la clave pública de Supabase.";
      return;
    }

    document.querySelectorAll(
      ".sidebar-nav button[data-seccion]"
    ).forEach(boton => {
      boton.addEventListener("click", () => {
        mostrarSeccion(boton.dataset.seccion);
      });
    });

    $("btnCerrarSesion").addEventListener(
      "click",
      cerrarSesion
    );

    $("btnNuevaAlerta").addEventListener(
      "click",
      () => {
        $("formNuevaAlerta").hidden = false;
      }
    );

    $("btnCancelarAlerta").addEventListener(
      "click",
      () => {
        $("formNuevaAlerta").hidden = true;
      }
    );

    $("formNuevaAlerta").addEventListener(
      "submit",
      crearAlerta
    );

    $("btnNuevoRefugio").addEventListener(
      "click",
      () => {
        $("formNuevoRefugio").hidden = false;
      }
    );

    $("btnCancelarRefugio").addEventListener(
      "click",
      () => {
        $("formNuevoRefugio").hidden = true;
      }
    );

    $("btnActualizarReportesSupervisor")?.addEventListener("click", cargarReportes);
    crearFormularioRefugio();

    await verificarSupervisor();
  }
);
