using Microsoft.EntityFrameworkCore;
using B.Models;

namespace B.Data
{
    public sealed class DatabaseContext : DbContext
    {
        public DbSet<User> Users { get; set; }
        public DbSet<Project> Projects { get; set; }
        public DbSet<ProjectFile> ProjectFiles { get; set; }
        public DbSet<IfcComponentComment> IfcComponentComments { get; set; }

        public DatabaseContext(DbContextOptions<DatabaseContext> options) : base(options)
        {
            // Database.EnsureCreated(); // Ensure the database is created if it does not exist
        }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<User>(entity =>
            {
                entity.HasKey(u => u.Id);
                entity.Property(u => u.Login).IsRequired();
                entity.Property(u => u.UserName).IsRequired();
                entity.Property(u => u.UserSurname).IsRequired();
                entity.Property(u => u.Email).IsRequired();
                entity.Property(u => u.Password).IsRequired(); // Ensure password is required
                entity.Property(u => u.CompanyName).IsRequired();
                entity.Property(u => u.CompanyPosition).IsRequired();
            });

            modelBuilder.Entity<Project>(entity =>
            {
                entity.HasKey(p => p.Id);
                entity.Property(p => p.Title).IsRequired();
                entity.Property(p => p.CreatedAt).IsRequired();
                entity.Property(p => p.LastModified).IsRequired();
            });

            modelBuilder.Entity<ProjectFile>(entity =>
            {
                entity.HasKey(f => f.Id);
                entity.Property(f => f.FileName).IsRequired().HasMaxLength(255);
                entity.Property(f => f.FileData).IsRequired();
                entity.Property(f => f.CreatedAt).IsRequired();
                entity.Property(f => f.LastModified).IsRequired();
                entity.HasOne(f => f.Project)
                      .WithMany(p => p.ProjectFiles)
                      .HasForeignKey(f => f.ProjectId)
                      .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<IfcComponentComment>(entity =>
            {
                entity.HasKey(c => c.Id);
                entity.Property(c => c.CommentText).IsRequired();
                entity.Property(c => c.CreatedAt).IsRequired();
            });
        }

        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        {
            if (!optionsBuilder.IsConfigured)
            {
                // optionsBuilder.UseSqlServer("YourConnectionStringHere"); // Update with your connection string

            }
        }
    }
}
