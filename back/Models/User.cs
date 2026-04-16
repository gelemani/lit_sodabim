using B.Controllers;

namespace B.Models;

public class User : AuthController.RegisterRequest
{
    public int Id { get; set; }
}