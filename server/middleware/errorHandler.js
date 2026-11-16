export function errorHandler(error, _request, response, _next) {
  void _next;
  if (error instanceof SyntaxError && "body" in error) {
    return response.status(400).json({ error: "El cuerpo de la solicitud no es JSON válido." });
  }

  console.error("Error en el servidor:", error);
  response.status(500).json({ error: "Ocurrió un error interno." });
}
