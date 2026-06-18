"use client";

import { useState, useRef, useEffect } from "react";

const CATEGORIES = [
  "Rent",
  "Utilities",
  "Food & Dining",
  "Vehicle Expense",
  "Travelling Expense",
  "Online Shopping",
  "Subscriptions",
  "Healthcare",
  "Education",
  "Charity / Sadqah",
  "Charity / Zakat",
  "Bank Fees / Charges",
  "Housekeeping Expenses",
  "Other",
];

const CATEGORY_COLORS = {
  "Rent": "#6366F1",
  "Utilities": "#3B82F6",
  "Food & Dining": "#EF4444",
  "Vehicle Expense": "#8B5CF6",
  "Travelling Expense": "#A78BFA",
  "Online Shopping": "#F59E0B",
  "Subscriptions": "#EC4899",
  "Healthcare": "#06B6D4",
  "Education": "#F97316",
  "Charity / Sadqah": "#10B981",
  "Charity / Zakat": "#059669",
  "Bank Fees / Charges": "#94A3B8",
  "Housekeeping Expenses": "#D97706",
  "Other": "#6B7280",
};

// Tax year: July 1 – June 30
function getTaxYears() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth(); // 0-indexed
  // If we're past June, current FY started this year; else started last year
  const latestStartYear = currentMonth >= 6 ? currentYear : currentYear - 1;
  const years = [];
  for (let y = latestStartYear; y >= latestStartYear - 4; y--) {
    years.push({
      label: `FY ${y}-${String(y + 1).slice(2)}`,
      start: `${y}-07-01`,
      end: `${y + 1}-06-30`,
    });
  }
  return years;
}

// Map app categories → wealth tax form lines
const TAX_FORM_LINES = [
  {
    label: "Rent",
    code: "7051",
    categories: ["Rent"],
  },
  {
    label: "Vehicle Running / Maintenance",
    code: "7055",
    categories: ["Vehicle Expense"],
  },
  {
    label: "Travelling",
    code: "7056",
    categories: ["Travelling Expense"],
  },
  {
    label: "Electricity / Water / Gas / Telephone",
    code: "7058–7061",
    categories: ["Utilities"],
  },
  {
    label: "Medical",
    code: "7070",
    categories: ["Healthcare"],
  },
  {
    label: "Educational",
    code: "7071",
    categories: ["Education"],
  },
  {
    label: "Donation / Sadqah / Zakat",
    code: "7076",
    categories: ["Charity / Sadqah", "Charity / Zakat"],
  },
  {
    label: "Online Shopping / Subscriptions",
    code: "—",
    categories: ["Online Shopping", "Subscriptions"],
  },
  {
    label: "Bank Fees / Charges",
    code: "—",
    categories: ["Bank Fees / Charges"],
  },
  {
    label: "Other Personal / Household",
    code: "7087",
    categories: ["Other", "Housekeeping Expenses"],
  },
];

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function formatAmount(amount, currency = "USD") {
  const cur = currency || "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur,
      minimumFractionDigits: 2,
    }).format(amount || 0);
  } catch {
    return `${cur} ${parseFloat(amount || 0).toFixed(2)}`;
  }
}

function formatTotals(totalsMap) {
  return Object.entries(totalsMap)
    .sort(([a], [b]) => a === "PKR" ? -1 : b === "PKR" ? 1 : a.localeCompare(b))
    .map(([cur, amt]) => formatAmount(amt, cur))
    .join("  +  ");
}

function formatDate(dateStr) {
  if (!dateStr) return "No date";
  const d = new Date(dateStr);
  if (isNaN(d)) return "No date";
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

function pkrTotal(list) {
  return list
    .filter(e => (e.currency || "PKR") === "PKR")
    .reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
}

const CATEGORIES_LIST = `"Rent", "Utilities", "Food & Dining", "Vehicle Expense", "Travelling Expense", "Online Shopping", "Subscriptions", "Healthcare", "Education", "Charity / Sadqah", "Charity / Zakat", "Bank Fees / Charges", "Housekeeping Expenses", "Other"`;

const EXTRACTION_RULES = `
IMPORTANT — Fees & charges:
- If the receipt shows a main amount AND a separate fee/charge/tax, return TWO objects in the array:
  1. The main transaction with its amount and appropriate category
  2. A separate entry for the fee with category "Bank Fees / Charges" and description like "JazzCash transfer fee"
- If there is no fee, return an array with just one object.

Currency rules:
- If you see "Rs.", "Rs", "PKR", or "Rupees" → use "PKR"
- If you see "$" or "USD" → use "USD"
- Otherwise detect accordingly

Date rules:
- Use YYYY-MM-DD format ONLY if a date is explicitly stated — do NOT guess or use today's date
- If no date found, use null

Category guidance:
- Fuel, car repair, oil change → "Vehicle Expense"
- Flights, hotels, intercity travel → "Travelling Expense"
- Electricity, gas, water, internet, phone bills → "Utilities"
- Sadqah, general charity donations → "Charity / Sadqah"
- Zakat specifically → "Charity / Zakat"
- Monthly rent payment → "Rent"
- Cleaning supplies, domestic staff, household maintenance → "Housekeeping Expenses"

Recurring/periodic expenses:
- If the text describes a recurring expense (e.g. "Rs. 5,000 per month from July 2025 to June 2026"), create ONE entry per month with the correct date (YYYY-MM-01 for each month) — do not create a single lump sum entry
- If the period is long (more than 6 months), instead create a single entry with the total amount and note the recurrence in the description`;

export default function ExpenseTracker() {
  const [expenses, setExpenses] = useState([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState("add");
  const [addMode, setAddMode] = useState("ai"); // "ai" | "quick"
  const [feedback, setFeedback] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [filterCategory, setFilterCategory] = useState("All");
  const [selectedTaxYear, setSelectedTaxYear] = useState(0);
  const [reportDateFrom, setReportDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(0); d.setDate(1);
    return d.toISOString().split("T")[0]; // Jan 1 of current year
  });
  const [reportDateTo, setReportDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [reportCategory, setReportCategory] = useState("All");
  const [reportSort, setReportSort] = useState("date-desc");
  const [quickForm, setQuickForm] = useState({
    merchant: "",
    amount: "",
    currency: "PKR",
    date: todayISO(),
    category: "Food & Dining",
    description: "",
  });
  const fileRef = useRef();
  const TAX_YEARS = getTaxYears();

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
    if (data.error) throw new Error(data.error);
    const raw = data.content?.find(b => b.type === "text")?.text || "";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    // If response was truncated, attempt to close the JSON array gracefully
    if (data.stop_reason === "max_tokens") {
      try {
        return JSON.parse(cleaned);
      } catch {
        // Try to salvage partial JSON by closing any open array
        const lastBrace = cleaned.lastIndexOf("}");
        if (lastBrace !== -1) {
          const salvaged = cleaned.slice(0, lastBrace + 1) + "]";
          try {
            return JSON.parse(salvaged);
          } catch {}
        }
        throw new Error("Response was too long and could not be parsed. Try splitting into fewer entries.");
      }
    }
    return cleaned;
  }

  const textExtractionSystem = `You are an expense extraction assistant. Extract expense details from receipt text or transaction messages.
Always return a JSON array (even for a single expense). Each item:
{
  "merchant": "name of store/service/payee",
  "amount": numeric value only (no currency symbols),
  "currency": ISO currency code,
  "date": "YYYY-MM-DD or null",
  "category": one of: ${CATEGORIES_LIST},
  "description": "brief one-line description",
  "confidence": "high" or "low"
}
${EXTRACTION_RULES}
If you cannot find any valid expense, return [{"error": "reason"}].
No markdown, no explanation, just the JSON array.`;

  const imageExtractionSystem = `You are an expense extraction assistant. Extract expense details from this receipt image.
Always return a JSON array (even for a single expense). Each item:
{
  "merchant": "name of store/service/payee (e.g. JazzCash, Easypaisa, bank name, shop name)",
  "amount": numeric value only,
  "currency": ISO currency code,
  "date": "YYYY-MM-DD ONLY if a date is explicitly visible in the image, else null",
  "category": one of: ${CATEGORIES_LIST},
  "description": "brief one-line description including recipient name if visible",
  "confidence": "high" or "low"
}
${EXTRACTION_RULES}
If not a receipt, return [{"error": "reason"}].
No markdown, just the JSON array.`;

  async function saveExtractedExpenses(results) {
    const saved = [];
    for (const result of results) {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      saved.push(data);
    }
    return saved;
  }

  async function handleExtract() {
    if (!inputText.trim()) return;
    setIsProcessing(true);
    try {
      const rawOrParsed = await callClaude([{ role: "user", content: inputText }], textExtractionSystem);
      const results = typeof rawOrParsed === "string" ? JSON.parse(rawOrParsed) : rawOrParsed;
      if (!Array.isArray(results)) throw new Error("Unexpected response format");
      if (results[0]?.error) {
        showFeedback("error", `Could not extract: ${results[0].error}`);
      } else {
        const saved = await saveExtractedExpenses(results);
        setExpenses(prev => [...saved, ...prev]);
        setInputText("");
        setActiveTab("log");
        if (saved.length === 1) {
          showFeedback("success", `Added: ${saved[0].merchant} — ${formatAmount(saved[0].amount, saved[0].currency)}`);
        } else {
          showFeedback("success", `Added ${saved.length} entries: ${saved.map(s => s.merchant).join(", ")}`);
        }
      }
    } catch (e) {
      showFeedback("error", "Extraction failed: " + e.message);
    }
    setIsProcessing(false);
  }

  async function handleQuickAdd() {
    const { merchant, amount, currency, date, category, description } = quickForm;
    if (!merchant.trim() || !amount) return;
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant, amount: parseFloat(amount), currency, date: date || null, category, description }),
      });
      const saved = await res.json();
      if (saved.error) throw new Error(saved.error);
      setExpenses(prev => [saved, ...prev]);
      setQuickForm({ merchant: "", amount: "", currency: "PKR", date: todayISO(), category: "Food & Dining", description: "" });
      setActiveTab("log");
      showFeedback("success", `Added: ${merchant} — ${formatAmount(amount, currency)}`);
    } catch (e) {
      showFeedback("error", "Could not save: " + e.message);
    }
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
          system: imageExtractionSystem,
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
      const results = JSON.parse(raw);
      if (!Array.isArray(results)) throw new Error("Unexpected response format");
      if (results[0]?.error) {
        showFeedback("error", `Could not extract: ${results[0].error}`);
      } else {
        const saved = await saveExtractedExpenses(results);
        setExpenses(prev => [...saved, ...prev]);
        setActiveTab("log");
        if (saved.length === 1) {
          showFeedback("success", `Added from image: ${saved[0].merchant} — ${formatAmount(saved[0].amount, saved[0].currency)}`);
        } else {
          showFeedback("success", `Added ${saved.length} entries from image: ${saved.map(s => s.merchant).join(", ")}`);
        }
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
      e.date || "", e.merchant || "", e.amount || 0, e.currency || "PKR",
      e.category || "", e.description || ""
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "expenses.csv"; a.click();
  }

  function exportTaxCSV(fyExpenses, taxYear) {
    const headers = ["Form Code", "Description", "Amount (PKR)"];
    const rows = TAX_FORM_LINES.map(line => {
      const lineExpenses = fyExpenses.filter(e => line.categories.includes(e.category));
      const total = pkrTotal(lineExpenses);
      return [line.code, line.label, total.toFixed(0)];
    });
    const grandTotal = pkrTotal(fyExpenses);
    rows.push(["7089", "Total Personal Expenses", grandTotal.toFixed(0)]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `tax-report-${taxYear.label.replace(" ", "-")}.csv`; a.click();
  }

  const filtered = filterCategory === "All" ? expenses : expenses.filter(e => e.category === filterCategory);

  function sumByCurrency(list) {
    return list.reduce((acc, e) => {
      const cur = e.currency || "PKR";
      acc[cur] = (acc[cur] || 0) + (parseFloat(e.amount) || 0);
      return acc;
    }, {});
  }

  const filteredTotals = sumByCurrency(filtered);
  const grandTotals = sumByCurrency(expenses);

  const categoryTotals = CATEGORIES.map(cat => {
    const catExpenses = expenses.filter(e => e.category === cat);
    return { cat, totals: sumByCurrency(catExpenses), count: catExpenses.length };
  }).filter(c => c.count > 0)
    .sort((a, b) => {
      const aT = Object.values(a.totals).reduce((s, v) => s + v, 0);
      const bT = Object.values(b.totals).reduce((s, v) => s + v, 0);
      return bT - aT;
    });

  // Tax report data
  const taxYear = TAX_YEARS[selectedTaxYear];
  const fyExpenses = expenses.filter(e => {
    if (!e.date) return false;
    return e.date >= taxYear.start && e.date <= taxYear.end;
  });
  const fyGrandTotal = pkrTotal(fyExpenses);

  // Custom date range report
  const reportExpenses = expenses
    .filter(e => {
      if (!e.date) return false;
      if (e.date < reportDateFrom || e.date > reportDateTo) return false;
      if (reportCategory !== "All" && e.category !== reportCategory) return false;
      return true;
    })
    .sort((a, b) => {
      if (reportSort === "date-desc") return (b.date || "").localeCompare(a.date || "");
      if (reportSort === "date-asc") return (a.date || "").localeCompare(b.date || "");
      if (reportSort === "amount-desc") return (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0);
      if (reportSort === "amount-asc") return (parseFloat(a.amount) || 0) - (parseFloat(b.amount) || 0);
      if (reportSort === "merchant") return (a.merchant || "").localeCompare(b.merchant || "");
      return 0;
    });
  const reportTotals = sumByCurrency(reportExpenses);
  const reportCategoryBreakdown = CATEGORIES.map(cat => ({
    cat,
    totals: sumByCurrency(reportExpenses.filter(e => e.category === cat)),
    count: reportExpenses.filter(e => e.category === cat).length,
  })).filter(c => c.count > 0);

  function exportReportCSV() {
    const headers = ["Date", "Merchant", "Amount", "Currency", "Category", "Description"];
    const rows = reportExpenses.map(e => [
      e.date || "", e.merchant || "", e.amount || 0,
      e.currency || "PKR", e.category || "", e.description || ""
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${reportDateFrom}-to-${reportDateTo}.csv`;
    a.click();
  }

  if (isLoadingData) {
    return (
      <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", background: "#0F172A", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B", fontSize: 14 }}>
        Loading your expenses…
      </div>
    );
  }

  const TABS = [
    { id: "add", label: "Add" },
    { id: "log", label: `Log (${expenses.length})` },
    { id: "summary", label: "Summary" },
    { id: "tax", label: "Tax Report" },
    { id: "report", label: "Reports" },
  ];

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
              {Object.keys(grandTotals).length === 0 ? (
                <div style={{ fontSize: 24, fontWeight: 700, color: "#34D399", letterSpacing: "-1px" }}>—</div>
              ) : (
                Object.entries(grandTotals)
                  .sort(([a], [b]) => a === "PKR" ? -1 : b === "PKR" ? 1 : a.localeCompare(b))
                  .map(([cur, amt]) => (
                    <div key={cur} style={{ fontSize: cur === "PKR" ? 22 : 16, fontWeight: 700, color: "#34D399", letterSpacing: "-0.5px", lineHeight: 1.3 }}>
                      {formatAmount(amt, cur)}
                    </div>
                  ))
              )}
              <div style={{ fontSize: 11, color: "#64748B" }}>{expenses.length} expense{expenses.length !== 1 ? "s" : ""}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 0, marginTop: 20, overflowX: "auto" }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                background: "none", border: "none", cursor: "pointer", padding: "10px 16px", fontSize: 13, fontWeight: 500,
                color: activeTab === tab.id ? "#34D399" : "#64748B", whiteSpace: "nowrap",
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
            {/* Mode toggle */}
            <div style={{ display: "flex", background: "#1E293B", borderRadius: 10, padding: 4, gap: 4 }}>
              {[{ id: "ai", label: "📋  AI Extract" }, { id: "quick", label: "✏️  Quick Add" }].map(m => (
                <button key={m.id} onClick={() => setAddMode(m.id)} style={{
                  flex: 1, border: "none", borderRadius: 7, padding: "8px 0", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  background: addMode === m.id ? "#334155" : "transparent",
                  color: addMode === m.id ? "#F1F5F9" : "#64748B",
                  transition: "all 0.15s",
                }}>{m.label}</button>
              ))}
            </div>

            {/* AI Extract mode */}
            {addMode === "ai" && (
              <>
                <div style={{ background: "#1E293B", borderRadius: 12, padding: 16, border: "1px solid #334155" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9", marginBottom: 8 }}>Paste Receipt / SMS / WhatsApp Text</div>
                  <textarea
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    placeholder={"Paste any receipt text, SMS alert, or WhatsApp message here…\n\nExamples:\n• \"Your payment of PKR 2,500 to PTCL was successful\"\n• \"You have donated Rs. 5,000 to Edhi Foundation (Sadqah)\"\n• \"JazzCash: Rs. 6,000 transferred to Furqan Ahmed\""}
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
              </>
            )}

            {/* Quick Add mode */}
            {addMode === "quick" && (
              <div style={{ background: "#1E293B", borderRadius: 12, padding: 16, border: "1px solid #334155", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9", marginBottom: 4 }}>Add expense manually — no receipt needed</div>

                <input
                  value={quickForm.merchant}
                  onChange={e => setQuickForm(f => ({ ...f, merchant: e.target.value }))}
                  placeholder="Merchant / description (e.g. Fruit seller, Dairy shop)"
                  style={{ ...qInputStyle }}
                />

                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="number"
                    value={quickForm.amount}
                    onChange={e => setQuickForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="Amount"
                    style={{ ...qInputStyle, flex: 2 }}
                  />
                  <select
                    value={quickForm.currency}
                    onChange={e => setQuickForm(f => ({ ...f, currency: e.target.value }))}
                    style={{ ...qInputStyle, flex: 1 }}
                  >
                    <option value="PKR">PKR</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="AED">AED</option>
                    <option value="SAR">SAR</option>
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, color: "#64748B" }}>Date</label>
                  <input
                    type="date"
                    value={quickForm.date}
                    onChange={e => setQuickForm(f => ({ ...f, date: e.target.value }))}
                    style={{ ...qInputStyle }}
                  />
                </div>

                <select
                  value={quickForm.category}
                  onChange={e => setQuickForm(f => ({ ...f, category: e.target.value }))}
                  style={{ ...qInputStyle }}
                >
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>

                <input
                  value={quickForm.description}
                  onChange={e => setQuickForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Note (optional)"
                  style={{ ...qInputStyle }}
                />

                <button
                  onClick={handleQuickAdd}
                  disabled={!quickForm.merchant.trim() || !quickForm.amount}
                  style={{
                    marginTop: 4, width: "100%",
                    background: !quickForm.merchant.trim() || !quickForm.amount ? "#0F172A" : "#059669",
                    color: !quickForm.merchant.trim() || !quickForm.amount ? "#475569" : "#fff",
                    border: "none", borderRadius: 8, padding: "10px 0",
                    fontSize: 13, fontWeight: 600,
                    cursor: !quickForm.merchant.trim() || !quickForm.amount ? "not-allowed" : "pointer",
                  }}
                >
                  Add Expense
                </button>
              </div>
            )}
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
                <div style={{ fontSize: 12, marginTop: 4 }}>Add your first one in the Add tab</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1E293B", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "#64748B" }}>{filtered.length} expense{filtered.length !== 1 ? "s" : ""}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#34D399" }}>{formatTotals(filteredTotals)}</span>
                </div>
                {filtered.map(expense => (
                  <div key={expense.id} style={{
                    background: "#1E293B", borderRadius: 10, padding: "12px 14px",
                    border: `1px solid ${expense.category === "Bank Fees / Charges" ? "#1E3A4A" : "#1E293B"}`,
                  }}>
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
                            <div style={{ fontWeight: 700, fontSize: 15, color: expense.category === "Bank Fees / Charges" ? "#94A3B8" : "#F1F5F9", marginLeft: 8 }}>
                              {formatAmount(expense.amount, expense.currency)}
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
                <div style={{ fontSize: 12, marginTop: 4 }}>Add expenses to see your summary</div>
              </div>
            ) : (
              <div>
                <div style={{ background: "#1E293B", borderRadius: 12, padding: 20, marginBottom: 16, border: "1px solid #334155" }}>
                  <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4 }}>Total Spending</div>
                  <div style={{ lineHeight: 1.4 }}>
                    {Object.entries(grandTotals)
                      .sort(([a], [b]) => a === "PKR" ? -1 : b === "PKR" ? 1 : a.localeCompare(b))
                      .map(([cur, amt]) => (
                        <div key={cur} style={{ fontSize: cur === "PKR" ? 30 : 20, fontWeight: 800, color: "#34D399", letterSpacing: "-1px" }}>
                          {formatAmount(amt, cur)}
                        </div>
                      ))}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>{expenses.length} transactions</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {categoryTotals.map(({ cat, totals, count }) => {
                    const catSum = Object.values(totals).reduce((s, v) => s + v, 0);
                    const grandSum = Object.values(grandTotals).reduce((s, v) => s + v, 0);
                    const pct = grandSum > 0 ? (catSum / grandSum) * 100 : 0;
                    return (
                      <div key={cat} style={{ background: "#1E293B", borderRadius: 10, padding: "12px 14px", border: "1px solid #334155" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                          <div>
                            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: CATEGORY_COLORS[cat], marginRight: 8 }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9" }}>{cat}</span>
                            <span style={{ fontSize: 11, color: "#64748B", marginLeft: 6 }}>{count} txn{count !== 1 ? "s" : ""}</span>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>{formatTotals(totals)}</span>
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

        {/* TAX REPORT TAB */}
        {activeTab === "tax" && (
          <div>
            {/* FY selector */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
              <select
                value={selectedTaxYear}
                onChange={e => setSelectedTaxYear(Number(e.target.value))}
                style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, color: "#E2E8F0", padding: "8px 12px", fontSize: 13, flex: 1 }}
              >
                {TAX_YEARS.map((y, i) => (
                  <option key={y.label} value={i}>{y.label} ({y.start.slice(0, 7)} to {y.end.slice(0, 7)})</option>
                ))}
              </select>
              <button onClick={() => exportTaxCSV(fyExpenses, taxYear)} disabled={fyExpenses.length === 0} style={{
                background: fyExpenses.length === 0 ? "#1E293B" : "#1E3A5F",
                border: "1px solid #334155", borderRadius: 8,
                color: fyExpenses.length === 0 ? "#475569" : "#60A5FA",
                padding: "8px 14px", fontSize: 12, cursor: fyExpenses.length === 0 ? "not-allowed" : "pointer", whiteSpace: "nowrap",
              }}>Export CSV</button>
            </div>

            {/* Summary card */}
            <div style={{ background: "#1E293B", borderRadius: 12, padding: 16, marginBottom: 16, border: "1px solid #334155" }}>
              <div style={{ fontSize: 11, color: "#64748B", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
                Personal Expenses — {taxYear.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#34D399", letterSpacing: "-1px" }}>
                {formatAmount(fyGrandTotal, "PKR")}
              </div>
              <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>
                {fyExpenses.length} transactions · {taxYear.start} to {taxYear.end}
              </div>
              {fyExpenses.length === 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#F59E0B" }}>
                  ⚠ No expenses with dates recorded for this fiscal year. Make sure expenses have dates assigned.
                </div>
              )}
            </div>

            {/* Form lines table */}
            <div style={{ display: "flex", flexDirection: "column", gap: 1, borderRadius: 10, overflow: "hidden", border: "1px solid #334155" }}>
              {/* Header */}
              <div style={{ display: "flex", background: "#0F172A", padding: "8px 14px", gap: 8 }}>
                <span style={{ fontSize: 11, color: "#475569", width: 70 }}>Code</span>
                <span style={{ fontSize: 11, color: "#475569", flex: 1 }}>Description</span>
                <span style={{ fontSize: 11, color: "#475569", textAlign: "right", minWidth: 110 }}>Amount (PKR)</span>
              </div>

              {TAX_FORM_LINES.map((line, i) => {
                const lineExpenses = fyExpenses.filter(e => line.categories.includes(e.category));
                const total = pkrTotal(lineExpenses);
                const hasData = total > 0;
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", padding: "10px 14px", gap: 8,
                    background: hasData ? "#1E293B" : "#161E2E",
                    borderTop: "1px solid #0F172A",
                  }}>
                    <span style={{ fontSize: 11, color: "#475569", width: 70, fontFamily: "monospace" }}>{line.code}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: hasData ? "#F1F5F9" : "#475569", fontWeight: hasData ? 500 : 400 }}>{line.label}</div>
                      <div style={{ fontSize: 11, color: "#475569", marginTop: 1 }}>
                        {line.categories.join(", ")}
                        {lineExpenses.length > 0 && ` · ${lineExpenses.length} txn${lineExpenses.length !== 1 ? "s" : ""}`}
                      </div>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: hasData ? "#F1F5F9" : "#334155", textAlign: "right", minWidth: 110 }}>
                      {hasData ? formatAmount(total, "PKR") : "—"}
                    </span>
                  </div>
                );
              })}

              {/* Grand total row */}
              <div style={{ display: "flex", alignItems: "center", padding: "12px 14px", gap: 8, background: "#0F172A", borderTop: "2px solid #334155" }}>
                <span style={{ fontSize: 11, color: "#64748B", width: 70, fontFamily: "monospace" }}>7089</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#F1F5F9" }}>Total Personal Expenses</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: "#34D399", textAlign: "right", minWidth: 110 }}>
                  {formatAmount(fyGrandTotal, "PKR")}
                </span>
              </div>
            </div>

            <div style={{ marginTop: 12, fontSize: 11, color: "#475569", lineHeight: 1.6 }}>
              * Only PKR expenses within the selected fiscal year are included. Expenses without a date are excluded — use the edit button in the Log to assign dates.
            </div>
          </div>
        )}

        {/* REPORTS TAB */}
        {activeTab === "report" && (
          <div>
            {/* Filters row 1: date range */}
            <div style={{ background: "#1E293B", borderRadius: 12, padding: 14, marginBottom: 12, border: "1px solid #334155", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8", letterSpacing: 1, textTransform: "uppercase" }}>Date Range</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#64748B", marginBottom: 3 }}>From</div>
                  <input type="date" value={reportDateFrom} onChange={e => setReportDateFrom(e.target.value)}
                    style={{ ...qInputStyle, padding: "7px 10px", fontSize: 12 }} />
                </div>
                <div style={{ color: "#475569", fontSize: 16, paddingTop: 16 }}>→</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#64748B", marginBottom: 3 }}>To</div>
                  <input type="date" value={reportDateTo} onChange={e => setReportDateTo(e.target.value)}
                    style={{ ...qInputStyle, padding: "7px 10px", fontSize: 12 }} />
                </div>
              </div>

              {/* Filters row 2: category + sort */}
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#64748B", marginBottom: 3 }}>Category</div>
                  <select value={reportCategory} onChange={e => setReportCategory(e.target.value)}
                    style={{ ...qInputStyle, padding: "7px 10px", fontSize: 12 }}>
                    <option value="All">All Categories</option>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#64748B", marginBottom: 3 }}>Sort By</div>
                  <select value={reportSort} onChange={e => setReportSort(e.target.value)}
                    style={{ ...qInputStyle, padding: "7px 10px", fontSize: 12 }}>
                    <option value="date-desc">Date (Newest first)</option>
                    <option value="date-asc">Date (Oldest first)</option>
                    <option value="amount-desc">Amount (High to Low)</option>
                    <option value="amount-asc">Amount (Low to High)</option>
                    <option value="merchant">Merchant (A–Z)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Summary strip */}
            {reportExpenses.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, background: "#1E293B", borderRadius: 10, padding: "10px 14px", border: "1px solid #334155", minWidth: 120 }}>
                  <div style={{ fontSize: 11, color: "#64748B", marginBottom: 2 }}>Transactions</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#F1F5F9" }}>{reportExpenses.length}</div>
                </div>
                {Object.entries(reportTotals)
                  .sort(([a], [b]) => a === "PKR" ? -1 : b === "PKR" ? 1 : a.localeCompare(b))
                  .map(([cur, amt]) => (
                    <div key={cur} style={{ flex: 2, background: "#1E293B", borderRadius: 10, padding: "10px 14px", border: "1px solid #334155", minWidth: 160 }}>
                      <div style={{ fontSize: 11, color: "#64748B", marginBottom: 2 }}>Total ({cur})</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#34D399" }}>{formatAmount(amt, cur)}</div>
                    </div>
                  ))}
                <button onClick={exportReportCSV} style={{
                  background: "#1E3A5F", border: "1px solid #334155", borderRadius: 10,
                  color: "#60A5FA", padding: "10px 16px", fontSize: 12, fontWeight: 600,
                  cursor: "pointer", alignSelf: "stretch",
                }}>Export CSV</button>
              </div>
            )}

            {/* Category breakdown (only when All selected) */}
            {reportCategory === "All" && reportCategoryBreakdown.length > 0 && (
              <div style={{ background: "#1E293B", borderRadius: 10, padding: "10px 14px", marginBottom: 12, border: "1px solid #334155" }}>
                <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>Category Breakdown</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {reportCategoryBreakdown.map(({ cat, totals, count }) => (
                    <div key={cat} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: CATEGORY_COLORS[cat] || "#6B7280" }} />
                        <span style={{ fontSize: 12, color: "#CBD5E1" }}>{cat}</span>
                        <span style={{ fontSize: 11, color: "#475569" }}>({count})</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#F1F5F9" }}>{formatTotals(totals)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Expense list */}
            {reportExpenses.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 0", color: "#475569" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>No expenses found</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Try adjusting the date range or category filter</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {reportExpenses.map(expense => (
                  <div key={expense.id} style={{
                    background: "#1E293B", borderRadius: 10, padding: "11px 14px",
                    border: `1px solid ${expense.category === "Bank Fees / Charges" ? "#1E3A4A" : "#1E293B"}`,
                    display: "flex", alignItems: "flex-start", gap: 10,
                  }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", marginTop: 5, background: CATEGORY_COLORS[expense.category] || "#6B7280", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "#F1F5F9" }}>{expense.merchant || "Unknown"}</div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: expense.category === "Bank Fees / Charges" ? "#94A3B8" : "#F1F5F9", marginLeft: 8, flexShrink: 0 }}>
                          {formatAmount(expense.amount, expense.currency)}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                        {formatDate(expense.date)} · <span style={{ color: CATEGORY_COLORS[expense.category] || "#6B7280" }}>{expense.category}</span>
                      </div>
                      {expense.description && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{expense.description}</div>}
                    </div>
                  </div>
                ))}
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

const qInputStyle = {
  width: "100%", background: "#0F172A", border: "1px solid #334155", borderRadius: 8,
  color: "#E2E8F0", padding: "9px 12px", fontSize: 13, outline: "none", fontFamily: "inherit",
  boxSizing: "border-box",
};

const btnStyle = {
  border: "none", borderRadius: 6, padding: "6px 14px",
  fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#fff",
};
