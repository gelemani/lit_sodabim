using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace B.Migrations
{
    /// <inheritdoc />
public partial class DropProjectsTableMigration : Migration

    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Projects");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Projects",
                columns: table => new
                {
                    Id = table.Column<int>(nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Title = table.Column<string>(nullable: false),
                    CreatedAt = table.Column<string>(nullable: false),
                    LastModified = table.Column<string>(nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Projects", x => x.Id);
                });
        }
    }
}
