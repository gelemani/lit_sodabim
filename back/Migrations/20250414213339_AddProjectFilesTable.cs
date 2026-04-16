using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace B.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectFilesTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ProjectFiles",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    ProjectId = table.Column<int>(type: "INTEGER", nullable: false),
                    FileName = table.Column<string>(type: "TEXT", maxLength: 255, nullable: false),
                    FileData = table.Column<byte[]>(type: "BLOB", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    LastModified = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectFiles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectFiles_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectFiles_ProjectId",
                table: "ProjectFiles",
                column: "ProjectId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProjectFiles");
        }
    }
}
