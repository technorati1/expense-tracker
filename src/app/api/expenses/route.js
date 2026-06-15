import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

// GET — fetch all expenses
export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .order("added_at", { ascending: false });
    if (error) throw error;
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST — add a new expense
export async function POST(request) {
  try {
    const supabase = getSupabase();
    const body = await request.json();
    const { merchant, amount, currency, date, category, description, confidence } = body;
    const { data, error } = await supabase
      .from("expenses")
      .insert([{ merchant, amount, currency, date: date || null, category, description, confidence }])
      .select()
      .single();
    if (error) throw error;
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// PATCH — update an expense
export async function PATCH(request) {
  try {
    const supabase = getSupabase();
    const body = await request.json();
    const { id, ...fields } = body;
    const { data, error } = await supabase
      .from("expenses")
      .update(fields)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// DELETE — remove an expense
export async function DELETE(request) {
  try {
    const supabase = getSupabase();
    const { id } = await request.json();
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) throw error;
    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
