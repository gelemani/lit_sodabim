using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace B.Migrations
{
    /// <inheritdoc />
    public partial class AddIfcComponentComments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "IfcComponentComments",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    ProjectId = table.Column<int>(type: "INTEGER", nullable: false),
                    ProjectFileId = table.Column<int>(type: "INTEGER", nullable: false),
                    ExpressId = table.Column<int>(type: "INTEGER", nullable: false),
                    ElementName = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    ElementDataJson = table.Column<string>(type: "TEXT", nullable: true),
                    CommentText = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: false),
                    UserId = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IfcComponentComments", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "IfcComponentComments");
        }
    }
}
