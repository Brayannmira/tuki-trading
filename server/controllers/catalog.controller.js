import {
  getCatalogProducts,
  importCatalogProducts,
  updateCatalogProduct,
} from "../services/orders.service.js";

export function listCatalog(_request, response) {
  response.json(getCatalogProducts());
}

export function listAdminCatalog(_request, response) {
  response.json(getCatalogProducts());
}

export function updateCatalogItem(request, response) {
  const productId = request.params.id;
  const product = request.body ?? {};
  const updatedProduct = updateCatalogProduct(productId, product);

  if (updatedProduct.error) {
    return response.status(updatedProduct.statusCode).json({ error: updatedProduct.error });
  }

  return response.json(updatedProduct);
}

export function importCatalogItems(request, response) {
  const result = importCatalogProducts(request.body?.products);
  if (result.error) {
    return response.status(result.statusCode).json({ error: result.error });
  }
  return response.json(result);
}
