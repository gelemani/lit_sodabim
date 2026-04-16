using B.Models;

namespace B.Repositories.Interfaces
{
    public interface IUserRepository
    {
        Task<User?> GetByLoginAsync(string login);
        Task<User?> GetByLoginOrEmailAsync(string login, string email);
        Task<User> CreateAsync(string login, string userName, string userSurname, string email, string password, string ConfirmPassword, string companyName, string companyPosition);
        Task<bool> ValidateCredentialsAsync(string login, string password);
        Task<User?> GetByIdAsync(int id);
        Task<IEnumerable<User>> GetAllAsync();
    }
}
