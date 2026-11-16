import { useState } from "react";
import { Link } from "react-router-dom";
import { useSelection } from "./SelectionContext.js";

function Formulario() {
  const { selectedItems, toggleItem } = useSelection();
  const [realName, setRealName] = useState("");
  const [gameNickname, setGameNickname] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Platino");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const [createdOrderId, setCreatedOrderId] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmissionError("");
    setCreatedOrderId("");

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          realName,
          gameNickname,
          paymentMethod,
          items: selectedItems.map(({ name, category }) => ({ name, category })),
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "No se pudo enviar la solicitud.");
      }

      setCreatedOrderId(result.id);
    } catch (error) {
      setSubmissionError(error.message || "No se pudo conectar con el servidor.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id="formulario" className="category-section card-bottom-left">
      <h2>Formulario de solicitud</h2>
      <p>Completa tus datos y confirma los artículos que quieres solicitar.</p>

      <form className="trade-form" onSubmit={handleSubmit}>
        <div className="trade-form-fields">
          <label>
            <span>Nombre real</span>
            <input
              type="text"
              autoComplete="name"
              value={realName}
              onChange={(event) => setRealName(event.target.value)}
              required
            />
          </label>
          <label>
            <span>Nickname del juego</span>
            <input
              type="text"
              autoComplete="nickname"
              value={gameNickname}
              onChange={(event) => setGameNickname(event.target.value)}
              required
            />
          </label>
        </div>

        <fieldset className="payment-options">
          <legend>Forma de pago</legend>
          {["Platino", "Dinero (COP)"].map((method) => (
            <label key={method}>
              <input
                type="radio"
                name="payment-method"
                value={method}
                checked={paymentMethod === method}
                onChange={(event) => setPaymentMethod(event.target.value)}
              />
              <span>{method}</span>
            </label>
          ))}
        </fieldset>

        <div className="selected-request-items">
          <h3>
            Artículos seleccionados <span>({selectedItems.length})</span>
          </h3>
          {selectedItems.length > 0 ? (
            <ul>
              {selectedItems.map((item) => (
                <li key={item.id}>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.category}</small>
                  </span>
                  <button type="button" onClick={() => toggleItem(item)}>
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              Aún no has seleccionado artículos.{" "}
              <Link to="/catalogo">Ir al catálogo</Link>
            </p>
          )}
        </div>

        <button
          className="trade-form-submit"
          type="submit"
          disabled={selectedItems.length === 0}
        >
          {isSubmitting ? "Enviando solicitud..." : "Enviar solicitud"}
        </button>
        {submissionError && <p className="trade-form-error" role="alert">{submissionError}</p>}
        {createdOrderId ? (
          <p className="trade-form-success" role="status">
            Solicitud recibida. Tu número de pedido es <strong>{createdOrderId}</strong>.
          </p>
        ) : (
          <p className="trade-form-note">Te confirmaremos el estado de tu solicitud.</p>
        )}
      </form>
    </section>
  );
}

export default Formulario;
