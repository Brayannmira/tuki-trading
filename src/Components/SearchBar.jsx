function SearchBar({ searchTerm, setSearchTerm }) {
  return (
    <div style={{ marginBottom: "25px", textAlign: "center" }}>
      <input
        type="text"
        placeholder="Buscar pieza, plano o arma..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        style={{
          width: "100%",
          maxWidth: "500px",
          padding: "12px 20px",
          fontSize: "1rem",
          backgroundColor: "#161b22",
          color: "#c9d1d9",
          border: "1px solid #30363d",
          borderRadius: "8px",
          outline: "none",
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
        }}
      />
    </div>
  );
}

export default SearchBar; // <-- ¡Asegúrate de que esta línea esté al final!