function SearchBar({ searchTerm, setSearchTerm }) {
  return (
    <div className="catalog-search">
      <input
        type="text"
        aria-label="Buscar artículos del catálogo"
        placeholder="Buscar pieza, plano o arma..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
    </div>
  );
}

export default SearchBar;