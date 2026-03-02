export async function onRequestPost(context) {
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzvQwTC9cYDWKMRrLOyxmo8werEm0WI1xaP8SgjDaaN30rddGvbg-4HOp8vuxCtE25YtQ/exec';
  
  try {
    const body = await context.request.json();
    const resp = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const text = await resp.text();
    let result;
    try { result = JSON.parse(text); }
    catch { result = { success: false, error: text }; }
    
    return new Response(JSON.stringify(result), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch(e) {
    return new Response(JSON.stringify({ success: false, error: e.toString() }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
