using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using B.Models;
using B.Repositories.Interfaces;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;
using System.Text;

namespace B.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly IUserRepository _userRepository;
        private readonly IConfiguration _configuration;

        public AuthController(IUserRepository userRepository, IConfiguration configuration)
        {
            _userRepository = userRepository;
            _configuration = configuration;
        }

        // Логин
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Login) || string.IsNullOrWhiteSpace(request.Password))
                return BadRequest(new { success = false, error = "Login and password must be provided." });

            var user = await _userRepository.GetByLoginAsync(request.Login);
            if (user == null || !await _userRepository.ValidateCredentialsAsync(request.Login, request.Password))
                return Unauthorized(new { success = false, error = "Invalid credentials" });

            // Генерация JWT-токена
            var token = GenerateJwtToken(user);

            return Ok(new
            {
                success = true,
                data = new
                {
                    token,
                    userId = user.Id
                }
            });
        }

        // Регистрация
        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Email) || !request.Email.Contains("@"))
                return BadRequest(new { success = false, error = "Invalid email format" });
            
            // if (request.Password != request.irmation)
            //     return BadRequest(new { success = false, error = "Passwords do not match" });

            var existingUser = await _userRepository.GetByLoginOrEmailAsync(request.Login, request.Email);
            if (existingUser != null)
                return Conflict(new { success = false, error = "User already exists" });

            var user = await _userRepository.CreateAsync(request.Login, request.UserName, request.UserSurname, request.Email, request.Password, request.ConfirmPassword, request.CompanyName, request.CompanyPosition);

            // Генерируем токен после успешной регистрации
            var token = GenerateJwtToken(user);

            return Ok(new
            {
                success = true,
                data = new
                {
                    token,
                    userId = user.Id
                }
            });
        }

        [HttpGet("getinfo")]
        public async Task<IActionResult> GetInfo(int id)
        {
            var user = await _userRepository.GetByIdAsync(id);
            if (user == null)
                return NotFound();
            return Ok(user);
        }

        [HttpGet("me")]
        [Authorize]
        public async Task<IActionResult> GetMe()
        {
            var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub);
            if (string.IsNullOrEmpty(sub) || !int.TryParse(sub, out var userId))
                return Unauthorized();

            var user = await _userRepository.GetByIdAsync(userId);
            if (user == null)
                return NotFound();
            return Ok(user);
        }

        private string GenerateJwtToken(User user)
        {
            var secretKey = _configuration["Jwt:Secret"];

            if (string.IsNullOrEmpty(secretKey))
            {
                throw new InvalidOperationException("JWT Secret не задан в конфигурации.");
            }

            var key = Encoding.UTF8.GetBytes(secretKey);

            var claims = new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new Claim(JwtRegisteredClaimNames.Email, user.Email),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
            };

            var token = new JwtSecurityToken(
                issuer: _configuration["Jwt:Issuer"],
                audience: _configuration["Jwt:Audience"],
                claims: claims,
                expires: DateTime.UtcNow.AddHours(2),
                signingCredentials: new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256)
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }


        public class LoginRequest
        {
            public string Login { get; set; } = string.Empty;
            public string Password { get; set; } = string.Empty;
        }

        public class RegisterRequest
        {
            public string Login { get; set; } = string.Empty;
            public string UserName { get; set; } = string.Empty;
            public string UserSurname { get; set; } = string.Empty;
            public string Email { get; set; } = string.Empty;
            public string Password { get; set; } = string.Empty;
            public string ConfirmPassword { get; set; } = string.Empty;
            public string CompanyName { get; set; } = string.Empty;
            public string CompanyPosition { get; set; } = string.Empty;
        }
    }
}
