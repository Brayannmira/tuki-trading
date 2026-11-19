import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import SearchBar from "../Components/SearchBar.jsx";

function SearchProbe() {
  const [searchTerm, setSearchTerm] = useState("");
  return (
    <>
      <SearchBar searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
      <output>{searchTerm}</output>
    </>
  );
}

describe("SearchBar", () => {
  it("updates and exposes the normalized text input", () => {
    render(<SearchProbe />);
    fireEvent.change(
      screen.getByRole("textbox", { name: "Buscar artículos del catálogo" }),
      { target: { value: "Ash Prime" } },
    );
    expect(screen.getByRole("status")).toHaveTextContent("Ash Prime");
  });
});
