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

        Task<IEnumerable<ProjectAccess>> GetProjectAccessesAsync(int projectId);
        Task SetProjectAccessesAsync(int projectId, IEnumerable<ProjectAccess> accesses);
        Task<ProjectAccess?> GetProjectAccessAsync(int projectId, int userId);
        Task UpsertProjectAccessAsync(int projectId, int userId, string accessLevel);
        Task RemoveProjectAccessAsync(int projectId, int userId);
    }
}
