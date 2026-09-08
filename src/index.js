export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "admissions-ratio-2027",
        stage: "cloudflare-connection-test"
      });
    }

    return new Response("Admissions Ratio Worker OK", {
      headers: { "content-type": "text/plain; charset=UTF-8" }
    });
  }
};
