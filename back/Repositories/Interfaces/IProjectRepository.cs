using B.Models;

namespace B.Repositories.Interfaces
{
    public interface IProjectRepository
    {
        Task<IEnumerable<Project>> GetAllAsync();
        Task<IEnumerable<Project>> GetProjectsByUserIdAsync(int userId);

        Task<Project?> GetByIdAsync(int id);
        Task CreateAsync(Project project);
        Task UpdateAsync(Project project);
        Task DeleteAsync(int id);

        Task AddProjectFilesAsync(int projectId, IEnumerable<ProjectFile> files);

        Task<IEnumerable<ProjectFile>> GetProjectFilesAsync(int projectId);
        Task<ProjectFile?> GetProjectFileByIdAsync(int fileId);
        Task DeleteProjectFileAsync(int fileId);
        Task UpdateProjectFileAsync(ProjectFile file);
    }
}
