using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace B.Migrations
{
    /// <inheritdoc />
    public partial class AddAccessLevelToProject : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AccessLevel",
                table: "Projects",
                type: "TEXT",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AccessLevel",
                table: "Projects");
        }
    }
}
