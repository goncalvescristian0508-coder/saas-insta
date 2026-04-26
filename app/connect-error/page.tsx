export default function ConnectErrorPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0c14", color: "#fff", fontFamily: "sans-serif", flexDirection: "column", gap: "1rem", textAlign: "center" }}>
      <div style={{ fontSize: "2.5rem" }}>⛔</div>
      <h1 style={{ fontWeight: 700, fontSize: "1.4rem" }}>Link inválido ou expirado</h1>
      <p style={{ color: "#888", fontSize: "0.9rem" }}>Gere um novo link no painel e tente novamente.</p>
    </div>
  );
}
