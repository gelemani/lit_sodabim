using Microsoft.EntityFrameworkCore;
using B.Models;
using B.Repositories.Interfaces;
using B.Data;

namespace B.Repositories.Implementations
{
    public class ProjectRepository : IProjectRepository
    {
        private readonly DatabaseContext _context;

        public ProjectRepository(DatabaseContext context)
        {
            _context = context;
        }

        public async Task<IEnumerable<Project>> GetAllAsync()
        {
            return await _context.Projects.ToListAsync();
        }

        public async Task<IEnumerable<Project>> GetProjectsByUserIdAsync(int userId)
        {
            return await _context.Projects
                .Where(p => p.UserId == userId) // Assuming Project has a UserId property
                .ToListAsync();
        }

        public async Task<Project?> GetByIdAsync(int id)
        {
            return await _context.Projects.FindAsync(id);
        }

        public async Task CreateAsync(Project project)
        {
            _context.Projects.Add(project);
            await _context.SaveChangesAsync();
        }

        public async Task UpdateAsync(Project project)
        {
            _context.Entry(project).State = EntityState.Modified;
            await _context.SaveChangesAsync();
        }

        public async Task DeleteAsync(int id)
        {
            var project = await _context.Projects.FindAsync(id);
            if (project != null)
            {
                _context.Projects.Remove(project);
                await _context.SaveChangesAsync();
            }
        }

        public async Task AddProjectFilesAsync(int projectId, IEnumerable<ProjectFile> files)
        {
            foreach (var file in files)
            {
                file.ProjectId = projectId;
                file.CreatedAt = DateTime.UtcNow;
                file.LastModified = DateTime.UtcNow;
                _context.ProjectFiles.Add(file);
            }
            await _context.SaveChangesAsync();
        }

        public async Task<IEnumerable<ProjectFile>> GetProjectFilesAsync(int projectId)
        {
            if (projectId == 0)
            {
                // Return all files if projectId is 0 (used for file download by fileId)
                return await _context.ProjectFiles.ToListAsync();
            }
            return await _context.ProjectFiles
                .Where(f => f.ProjectId == projectId)
                .ToListAsync();
        }

        public async Task<ProjectFile?> GetProjectFileByIdAsync(int fileId)
        {
            return await _context.ProjectFiles.FindAsync(fileId);
        }

        public async Task DeleteProjectFileAsync(int fileId)
        {
            var file = await _context.ProjectFiles.FindAsync(fileId);
            if (file != null)
            {
                _context.ProjectFiles.Remove(file);
                await _context.SaveChangesAsync();
            }
        }

        public async Task UpdateProjectFileAsync(ProjectFile file)
        {
            file.LastModified = DateTime.UtcNow;
            _context.Entry(file).State = EntityState.Modified;
            await _context.SaveChangesAsync();
        }
    }
}
