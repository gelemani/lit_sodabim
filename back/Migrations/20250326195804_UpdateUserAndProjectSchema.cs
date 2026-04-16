using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace B.Migrations
{
    /// <inheritdoc />
    public partial class UpdateUserAndProjectSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "Patronymic",
                table: "Users",
                newName: "UserSurname");

            migrationBuilder.RenameColumn(
                name: "PasswordConfirmation",
                table: "Users",
                newName: "UserName");

            migrationBuilder.RenameColumn(
                name: "LastName",
                table: "Users",
                newName: "ConfirmPassword");

            migrationBuilder.RenameColumn(
                name: "FullName",
                table: "Users",
                newName: "CompanyPosition");

            migrationBuilder.AddColumn<string>(
                name: "CompanyName",
                table: "Users",
                type: "TEXT",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CompanyName",
                table: "Users");

            migrationBuilder.RenameColumn(
                name: "UserSurname",
                table: "Users",
                newName: "Patronymic");

            migrationBuilder.RenameColumn(
                name: "UserName",
                table: "Users",
                newName: "PasswordConfirmation");

            migrationBuilder.RenameColumn(
                name: "ConfirmPassword",
                table: "Users",
                newName: "LastName");

            migrationBuilder.RenameColumn(
                name: "CompanyPosition",
                table: "Users",
                newName: "FullName");
        }
    }
}
