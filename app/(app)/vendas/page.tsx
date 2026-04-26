"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  APPROVED:  { label: "Aprovada",   color: "#22c55e" },
  PENDING:   { label: "Pendente",   color: "#FFD54F" },
  REFUNDED:  { label: "Reembolso",  color: "#60a5fa" },
  CANCELLED: { label: "Cancelada",  color: "#ef4444" },
};

function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

interface Sale {
  id: string; gateway: string; amount: number; status: string;
  customerName: string | null; igUsername: string | null;
  planName: string | null; createdAt: string;
}

export default function VendasPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sales?limit=100&period=maximo")
      .then((r) => r.json())
      .then((d) => setSales(d.sales ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Histórico de Vendas
        </div>
        <div style={{ fontSize: 13, color: "#555", marginTop: 3 }}>
          Todas as transações registradas
        </div>
      </div>

      <div className="panel">
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "48px" }}>
            <Loader2 size={22} color="#444" style={{ animation: "spin 1s linear infinite" }} />
          </div>
        ) : sales.length === 0 ? (
          <div style={{ padding: "48px 18px", textAlign: "center" }}>
            <p style={{ color: "#444", fontSize: 13 }}>
              Nenhuma venda registrada. Configure o webhook em{" "}
              <a href="/integracoes" style={{ color: "#FFD54F" }}>Integrações</a>.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["ID", "Produto", "Conta IG", "Valor", "Cliente", "Gateway", "Status", "Hora"].map((h) => (
                    <th key={h} style={{
                      padding: "10px 16px", textAlign: "left",
                      fontSize: 11, fontWeight: 600, color: "#444",
                      textTransform: "uppercase", letterSpacing: "0.07em",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      whiteSpace: "nowrap",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => {
                  const cfg = STATUS_MAP[s.status] ?? STATUS_MAP.PENDING;
                  return (
                    <tr key={s.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "13px 16px", fontSize: 12, color: "#555" }}>
                        #{s.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td style={{ padding: "13px 16px", fontSize: 13, color: "#bbb" }}>
                        {s.planName ?? "—"}
                      </td>
                      <td style={{ padding: "13px 16px", fontSize: 13 }}>
                        {s.igUsername
                          ? <span style={{ color: "#FFD54F", fontWeight: 600 }}>@{s.igUsername}</span>
                          : <span style={{ color: "#444" }}>—</span>}
                      </td>
                      <td style={{ padding: "13px 16px", fontSize: 13, fontWeight: 600, color: "#22c55e" }}>
                        {formatCurrency(s.amount)}
                      </td>
                      <td style={{ padding: "13px 16px", fontSize: 13, color: "#888" }}>
                        {s.customerName ?? "—"}
                      </td>
                      <td style={{ padding: "13px 16px", fontSize: 13, color: "#555", textTransform: "capitalize" }}>
                        {s.gateway}
                      </td>
                      <td style={{ padding: "13px 16px" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "3px 10px", borderRadius: 20,
                          fontSize: 11.5, fontWeight: 600,
                          background: cfg.color + "1e", color: cfg.color,
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.color, display: "inline-block" }} />
                          {cfg.label}
                        </span>
                      </td>
                      <td style={{ padding: "13px 16px", fontSize: 13, color: "#555" }}>
                        {formatDateTime(s.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
