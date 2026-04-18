using Microsoft.AspNetCore.Mvc;
using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace B.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AiController : ControllerBase
    {
        private readonly IHttpClientFactory _http;
        private readonly IConfiguration _config;

        public AiController(IHttpClientFactory http, IConfiguration config)
        {
            _http = http;
            _config = config;
        }

        [HttpPost("chat")]
        public async Task<IActionResult> Chat([FromBody] AiChatRequest req)
        {
            var apiKey = Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY")
                ?? _config["Anthropic:ApiKey"];

            if (string.IsNullOrWhiteSpace(apiKey))
                return StatusCode(503, new { error = "AI service not configured. Set ANTHROPIC_API_KEY." });

            var client = _http.CreateClient();
            client.DefaultRequestHeaders.Add("x-api-key", apiKey);
            client.DefaultRequestHeaders.Add("anthropic-version", "2023-06-01");

            var userContent = string.IsNullOrWhiteSpace(req.ElementProperties)
                ? req.Message
                : $"IFC element context:\n{req.ElementProperties}\n\nQuestion: {req.Message}";

            var body = new
            {
                model = "claude-haiku-4-5-20251001",
                max_tokens = 600,
                system = "You are a BIM/IFC expert assistant embedded in a 3D model viewer. Answer questions about building elements, construction, and IFC data concisely. Respond in the same language the user writes in.",
                messages = new[] { new { role = "user", content = userContent } }
            };

            try
            {
                var resp = await client.PostAsJsonAsync("https://api.anthropic.com/v1/messages", body);
                if (!resp.IsSuccessStatusCode)
                {
                    var err = await resp.Content.ReadAsStringAsync();
                    return StatusCode((int)resp.StatusCode, new { error = err });
                }
                var result = await resp.Content.ReadFromJsonAsync<AnthropicResponse>();
                var text = result?.Content?.FirstOrDefault()?.Text ?? "";
                return Ok(new { reply = text });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }
    }

    public class AiChatRequest
    {
        public string Message { get; set; } = string.Empty;
        public string? ElementProperties { get; set; }
    }

    public class AnthropicResponse
    {
        [JsonPropertyName("content")]
        public List<AnthropicContent>? Content { get; set; }
    }

    public class AnthropicContent
    {
        [JsonPropertyName("text")]
        public string? Text { get; set; }
    }
}
