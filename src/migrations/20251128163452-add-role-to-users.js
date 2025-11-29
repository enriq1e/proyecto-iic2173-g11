"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Users", "role", {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "user",
    });
  },

  async down(queryInterface, Sequelize) {
    // Revertir: eliminar la columna "role"
    await queryInterface.removeColumn("Users", "role");
  },
};
