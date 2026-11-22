// Ayudas para mostrar los PDF de los contratos (DEF-04 y R-08).
// La API ya no entrega archivos por un enlace directo: hay que pedirlos con el
// token de la sesión (o con la contraseña del enlace compartido en el cuerpo).
// Por eso el PDF se descarga con axios y se muestra desde memoria con una URL
// temporal "blob:", que no lleva ni el token ni la contraseña.

export function urlTemporalDePdf(datos) {
  return URL.createObjectURL(new Blob([datos], { type: "application/pdf" }));
}

// Abre el PDF en una pestaña nueva. La pestaña se abre antes de la petición
// para que el navegador no la bloquee como ventana emergente. Devuelve false
// si no se pudo obtener el archivo, para que la pantalla muestre el error.
export async function abrirPdfEnPestana(pedirArchivo) {
  const ventana = window.open("", "_blank");
  try {
    const { data } = await pedirArchivo();
    const url = urlTemporalDePdf(data);
    if (ventana) {
      ventana.location.href = url;
    } else {
      window.open(url, "_blank");
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  } catch {
    ventana?.close();
    return false;
  }
}
