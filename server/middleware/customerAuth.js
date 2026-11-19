import { resolveCustomerSession } from "../services/customerAuth.service.js";

export function attachOptionalCustomer(request, _response, next) {
  const customer = resolveCustomerSession(request);
  if (customer) request.customer = customer;
  next();
}

export function requireCustomer(request, response, next) {
  const customer = resolveCustomerSession(request);
  if (!customer) {
    return response.status(401).json({ error: "Inicia sesión para consultar tus pedidos." });
  }

  request.customer = customer;
  return next();
}
