"use client";

import { useState, useRef, useEffect } from "react";

const CATEGORIES = [
  "Utilities",
  "Charity / Donations",
  "Online Shopping",
  "Food & Dining",
  "Transport",
  "Subscriptions",
  "Healthcare",
  "Education",
  "Other",
];

const CATEGORY_COLORS = {
  "Utilities": "#3B82F6",
  "Charity / Donations": "#10B981",
  "Online Shopping": "#F59E0B",
  "Food & Dining": "#EF4444",
  "Transport": "#8B5CF6",
  "Subscriptions": "#EC4899",
  "Healthcare": "#06B6D4",
  "Education": "#F97316",
  "Other": "#6B7280",
};

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount || 0);
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ExpenseTracker() {
  const [expenses, setExpenses] = useState([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState("add");
  const [feedback, setFeedback] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [filterCategory, setFilterCategory] = useState("All");
  const fileRef = useRef();

  // Load expenses from Supabase on mount
  useEffect(() => {
    async function loadExpenses() {
      try {
        const res = await fetch("/api/expenses");
        const data = await res.json();
        if (Array.isArray(data)) setExpenses(data);
        else throw new Error(data.error || "Failed to load");
      } catch (e) {
        showFeedback("error", "Could not load expenses: " + e.message);
      } finally {
        setIsLoadingData(false);
      }
    }
    loadExpenses();
  }, []);

  function showFeedback(type, message) {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  }

  async function callClaude(messages, system) {
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, system }),
    });
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    const raw = data.content?.find(b => b.type === "text")?.text || "";
    return raw.replace(/```json|```/g, "").trim();
  }

  const extractionSystem = `You are an expense extraction assistant. Extract expense details from receipt text or transaction messages.
Return ONLY a valid JSON object with these fields:
{
  "merchant": "name of store/service/payee",
  "amount": numeric value only (no currency symbols),
  "currency": "USD" or detected currency code,
  "date": "YYYY-MM-DD format if found, else null",
  "category": one of: "Utilities", "Charity / Donations", "Online Shopping", "Food & Dining", "Transport", "Subscriptions", "Healthcare", "Education", "Other",
  "description": "brief one-line description of the transaction",
  "confidence": "high" or "low"
}
If you cannot find a valid expense, return {"error": "reason"}.
No markdown, no explanation, just the JSON object.`;

  async function addExpenseToDb(expenseData) {
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(expenseData),
    });
    const saved = await res.json();
    if (saved.error) throw new Error(saved.error);
    return saved;
  }

  async function handleExtract() {
    if (!inputText.trim()) return;
    setIsProcessing(true);
    try {
      const raw = await callClaude([{ role: "user", content: inputText }], extractionSystem);
      const result = JSON.parse(raw);
      if (result.error) {
        showFeedback("error", `Could not extract: ${result.error}`);
      } else {
        const saved = await addExpenseToDb(result);
        setExpenses(prev => [saved, ...prev]);
        setInputText("");
        setActiveTab("log");
        showFeedback("success", `Added: ${result.merchant} — ${formatCurrency(result.amount)}`);
      }
    } catch (e) {
      showFeedback("error", "Extraction failed: " + e.message);
    }
    setIsProcessing(false);
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    try {
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result.split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: `You are an expense extraction assistant. Extract expense details from this receipt image.
Return ONLY a valid JSON object:
{
  "merchant": "name of store/service/payee",
  "amount": numeric value only,
  "currency": "USD" or detected currency code,
  "date": "YYYY-MM-DD or null",
  "category": one of: "Utilities", "Charity / Donations", "Online Shopping", "Food & Dining", "Transport", "Subscriptions", "Healthcare", "Education", "Other",
  "description": "brief one-line description",
  "confidence": "high" or "low"
}
If not a receipt, return {"error": "reason"}. No markdown, just JSON.`,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: file.type, data: base64 } },
              { type: "text", text: "Extract expense details from this receipt image." }
            ]
          }],
        }),
      });
      const data = await res.json();
      const raw = data.content?.find(b => b.type === "text")?.text?.replace(/```json|```/g, "").trim() || "";
      const result = JSON.parse(raw);
      if (result.error) {
        showFeedback("error", `Could not extract: ${result.error}`);
      } else {
        const saved = await addExpenseToDb(result);
        setExpenses(prev => [saved, ...prev]);
        setActiveTab("log");
        showFeedback("success", `Added from image: ${result.merchant} — ${formatCurrency(result.amount)}`);
      }
    } catch (e) {
      showFeedback("error", "Image extraction failed: " + e.message);
    }
    setIsProcessing(false);
    e.target.value = "";
  }

  async function deleteExpense(id) {
    try {
      const res = await fetch("/api/expenses", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setExpenses(prev => prev.filter(e => e.id !== id));
    } catch (e) {
      showFeedback("error", "Delete failed: " + e.message);
    }
  }

  async function clearAll() {
    if (!window.confirm("Clear all expenses? This cannot be undone.")) return;
    try {
      await Promise.all(expenses.map(e =>
        fetch("/api/expenses", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: e.id }),
        })
      ));
      setExpenses([]);
    } catch (e) {
      showFeedback("error", "Clear failed: " + e.message);
    }
  }

  function startEdit(expense) {
    setEditingId(expense.id);
    setEditValues({ ...expense });
  }

  async function saveEdit() {
    try {
      const res = await fetch("/api/expenses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editValues),
      });
      const updated = await res.json();
      if (updated.error) throw new Error(updated.error);
      setExpenses(prev => prev.map(e => e.id === editingId ? updated : e));
      setEditingId(null);
    } catch (e) {
      showFeedback("error", "Save failed: " + e.message);
    }
  }

  function exportCSV() {
    const headers = ["Date", "Merchant", "Amount", "Currency", "Category", "Description"];
    const rows = expenses.map(e => [
      e.date || "", e.merchant || "", e.amount || 0, e.currency || "USD",
      e.category || "", e.description || ""
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "expenses.csv"; a.click();
  }

  const filtered = filterCategory === "All" ? expenses : expenses.filter(e => e.category === filterCategory);
  const total = filtered.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  const categoryTotals = CATEGORIES.map(cat => ({
    cat,
    total: expenses.filter(e => e.category === cat).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0),
    count: expenses.filter(e => e.category === cat).length,
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
  const grandTotal = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

  if (isLoadingData) {
    return (
      <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", background: "#0F172A", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B", fontSize: 14 }}>
        Loading your expenses…
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", background: "#0F172A", minHeight: "100vh", color: "#E2E8F0" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #1E293B 0%, #0F172A 100%)", borderBottom: "1px solid #1E293B", padding: "20px 24px 0" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: 3, color: "#64748B", textTransform: "uppercase", marginBottom: 4 }}>Personal Finance</div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#F1F5F9", letterSpacing: "-0.5px" }}>Expense Tracker</h1>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "#64748B", marginBottom: 2 }}>Total Logged</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#34D399", letterSpacing: "-1px" }}>{formatCurrency(grandTotal)}</div>
              <div style={{ fontSize: 11, color: "#64748B" }}>{expenses.length} expense{expenses.length !== 1 ? "s" : ""}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 0, marginTop: 20 }}>
            {[{ id: "add", label: "Add Expense" }, { id: "log", label: `Log (${expenses.length})` }, { id: "summary", label: "Summary" }].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                background: "none", border: "none", cursor: "pointer", padding: "10px 20px", fontSize: 13, fontWeight: 500,
                color: activeTab === tab.id ? "#34D399" : "#64748B",
                borderBottom: activeTab === tab.id ? "2px solid #34D399" : "2px solid transparent",
                transition: "all 0.15s",
              }}>{tab.label}</button>
            ))}
          </div>
        </div>
      </div>

      {feedback && (
        <div style={{
          background: feedback.type === "success" ? "#064E3B" : "#450A0A",
          borderBottom: `1px solid ${feedback.type === "success" ? "#10B981" : "#EF4444"}`,
          padding: "10px 24px", fontSize: 13,
          color: feedback.type === "success" ? "#34D399" : "#FCA5A5", textAlign: "center",
        }}>
          {feedback.type === "success" ? "✓" : "✗"} {feedback.message}
        </div>
      )}

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px" }}>

        {/* ADD TAB */}
        {activeTab === "add" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "#1E293B", borderRadius: 12, padding: 16, border: "1px solid #334155" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9", marginBottom: 8 }}>📋 Paste Receipt / SMS / WhatsApp Text</div>
              <textarea
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder={"Paste any receipt text, SMS alert, or WhatsApp message here…\n\nExamples:\n• \"Your payment of PKR 2,500 to PTCL was successful\"\n• \"You have donated $50 to Edhi Foundation\"\n• \"Order #1234 confirmed. Total: $89.99\""}
                rows={6}
                style={{
                  width: "100%", background: "#0F172A", border: "1px solid #334155", borderRadius: 8,
                  padding: "10px 12px", color: "#E2E8F0", fontSize: 13, lineHeight: 1.6,
                  resize: "vertical", outline: "none", boxSizing: "border-box", fontFamily: "inherit",
                }}
              />
              <button onClick={handleExtract} disabled={isProcessing || !inputText.trim()} style={{
                marginTop: 10, width: "100%",
                background: isProcessing || !inputText.trim() ? "#1E293B" : "#059669",
                color: isProcessing || !inputText.trim() ? "#475569" : "#fff",
                border: "none", borderRadius: 8, padding: "10px 0",
                fontSize: 13, fontWeight: 600, cursor: isProcessing || !inputText.trim() ? "not-allowed" : "pointer",
              }}>
                {isProcessing ? "Extracting…" : "Extract & Add Expense"}
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: "#1E293B" }} />
              <span style={{ fontSize: 11, color: "#475569", letterSpacing: 2, textTransform: "uppercase" }}>or upload image</span>
              <div style={{ flex: 1, height: 1, background: "#1E293B" }} />
            </div>

            <div onClick={() => fileRef.current?.click()} style={{
              background: "#1E293B", borderRadius: 12, padding: 20, border: "1px dashed #334155",
              textAlign: "center", cursor: "pointer",
            }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>🖼️</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9", marginBottom: 4 }}>Upload Receipt Screenshot</div>
              <div style={{ fontSize: 12, color: "#64748B" }}>PNG, JPG — WhatsApp screenshots, bank app screenshots, etc.</div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageUpload} />
              {isProcessing && <div style={{ marginTop: 8, fontSize: 12, color: "#34D399" }}>Processing image…</div>}
            </div>
          </div>
        )}

        {/* LOG TAB */}
        {activeTab === "log" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{
                background: "#1E293B", border: "1px solid #334155", borderRadius: 8,
                color: "#E2E8F0", padding: "6px 10px", fontSize: 12, flex: 1,
              }}>
                <option value="All">All Categories</option>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <button onClick={exportCSV} disabled={expenses.length === 0} style={{
                background: "#1E293B", border: "1px solid #334155", borderRadius: 8,
                color: expenses.length === 0 ? "#475569" : "#94A3B8",
                padding: "6px 14px", fontSize: 12, cursor: expenses.length === 0 ? "not-allowed" : "pointer",
              }}>Export CSV</button>
              <button onClick={clearAll} disabled={expenses.length === 0} style={{
                background: "#1E293B", border: "1px solid #334155", borderRadius: 8,
                color: expenses.length === 0 ? "#475569" : "#EF4444",
                padding: "6px 14px", fontSize: 12, cursor: expenses.length === 0 ? "not-allowed" : "pointer",
              }}>Clear All</button>
            </div>

            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 0", color: "#475569" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🧾</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>No expenses yet</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Add your first one in the Add Expense tab</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1E293B", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "#64748B" }}>{filtered.length} expense{filtered.length !== 1 ? "s" : ""}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#34D399" }}>{formatCurrency(total)}</span>
                </div>
                {filtered.map(expense => (
                  <div key={expense.id} style={{ background: "#1E293B", borderRadius: 10, padding: "12px 14px", border: "1px solid #1E293B" }}>
                    {editingId === expense.id ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input value={editValues.merchant || ""} onChange={e => setEditValues(v => ({ ...v, merchant: e.target.value }))} placeholder="Merchant" style={inputStyle} />
                          <input type="number" value={editValues.amount || ""} onChange={e => setEditValues(v => ({ ...v, amount: e.target.value }))} placeholder="Amount" style={{ ...inputStyle, width: 90 }} />
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input type="date" value={editValues.date || ""} onChange={e => setEditValues(v => ({ ...v, date: e.target.value }))} style={inputStyle} />
                          <select value={editValues.category || "Other"} onChange={e => setEditValues(v => ({ ...v, category: e.target.value }))} style={{ ...inputStyle, flex: 1 }}>
                            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                          </select>
                        </div>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button onClick={() => setEditingId(null)} style={{ ...btnStyle, background: "#334155" }}>Cancel</button>
                          <button onClick={saveEdit} style={{ ...btnStyle, background: "#059669" }}>Save</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 5, background: CATEGORY_COLORS[expense.category] || "#6B7280", flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div style={{ fontWeight: 600, fontSize: 14, color: "#F1F5F9", marginBottom: 2 }}>{expense.merchant || "Unknown"}</div>
                            <div style={{ fontWeight: 700, fontSize: 15, color: "#F1F5F9", marginLeft: 8 }}>
                              {expense.currency !== "USD" ? expense.currency + " " : ""}{formatCurrency(expense.amount)}
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>
                            {formatDate(expense.date)} · <span style={{ color: CATEGORY_COLORS[expense.category] || "#6B7280" }}>{expense.category}</span>
                          </div>
                          {expense.description && <div style={{ fontSize: 12, color: "#94A3B8" }}>{expense.description}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          <button onClick={() => startEdit(expense)} style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", fontSize: 14, padding: "2px 4px" }}>✎</button>
                          <button onClick={() => deleteExpense(expense.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", fontSize: 14, padding: "2px 4px" }}>✕</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SUMMARY TAB */}
        {activeTab === "summary" && (
          <div>
            {expenses.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 0", color: "#475569" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>No data yet</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Add expenses to see your spending summary</div>
              </div>
            ) : (
              <div>
                <div style={{ background: "#1E293B", borderRadius: 12, padding: 20, marginBottom: 16, border: "1px solid #334155" }}>
                  <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4 }}>Total Spending</div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: "#34D399", letterSpacing: "-1px" }}>{formatCurrency(grandTotal)}</div>
                  <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>{expenses.length} transactions</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {categoryTotals.map(({ cat, total, count }) => {
                    const pct = grandTotal > 0 ? (total / grandTotal) * 100 : 0;
                    return (
                      <div key={cat} style={{ background: "#1E293B", borderRadius: 10, padding: "12px 14px", border: "1px solid #334155" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                          <div>
                            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: CATEGORY_COLORS[cat], marginRight: 8 }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9" }}>{cat}</span>
                            <span style={{ fontSize: 11, color: "#64748B", marginLeft: 6 }}>{count} txn{count !== 1 ? "s" : ""}</span>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>{formatCurrency(total)}</span>
                            <span style={{ fontSize: 11, color: "#64748B", marginLeft: 6 }}>{pct.toFixed(0)}%</span>
                          </div>
                        </div>
                        <div style={{ background: "#0F172A", borderRadius: 99, height: 4, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: CATEGORY_COLORS[cat], borderRadius: 99, transition: "width 0.4s ease" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  flex: 1, background: "#0F172A", border: "1px solid #334155", borderRadius: 6,
  color: "#E2E8F0", padding: "6px 10px", fontSize: 12, outline: "none", fontFamily: "inherit",
};

const btnStyle = {
  border: "none", borderRadius: 6, padding: "6px 14px",
  fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#fff",
};
