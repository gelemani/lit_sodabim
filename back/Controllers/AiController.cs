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
            var apiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY")
                ?? _config["OpenAI:ApiKey"];

            if (string.IsNullOrWhiteSpace(apiKey))
                return StatusCode(503, new { error = "AI service not configured. Set OPENAI_API_KEY." });

            var userContent = string.IsNullOrWhiteSpace(req.ElementProperties)
                ? req.Message
                : $"IFC element context:\n{req.ElementProperties}\n\nQuestion: {req.Message}";

            var body = new
            {
                model = "gpt-4o-mini",
                max_tokens = 600,
                messages = new object[]
                {
                    new { role = "system", content = "You are a BIM/IFC expert assistant embedded in a 3D model viewer. Answer questions about building elements, construction, and IFC data concisely. Respond in the same language the user writes in." },
                    new { role = "user", content = userContent }
                }
            };

            var client = _http.CreateClient();
            client.DefaultRequestHeaders.Add("Authorization", $"Bearer {apiKey}");

            try
            {
                var resp = await client.PostAsJsonAsync("https://api.openai.com/v1/chat/completions", body);
                if (!resp.IsSuccessStatusCode)
                {
                    var err = await resp.Content.ReadAsStringAsync();
                    return StatusCode((int)resp.StatusCode, new { error = err });
                }
                var result = await resp.Content.ReadFromJsonAsync<OpenAiResponse>();
                var text = result?.Choices?.FirstOrDefault()?.Message?.Content ?? "";
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

    public class OpenAiResponse
    {
        [JsonPropertyName("choices")]
        public List<OpenAiChoice>? Choices { get; set; }
    }

    public class OpenAiChoice
    {
        [JsonPropertyName("message")]
        public OpenAiMessage? Message { get; set; }
    }

    public class OpenAiMessage
    {
        [JsonPropertyName("content")]
        public string? Content { get; set; }
    }
}
