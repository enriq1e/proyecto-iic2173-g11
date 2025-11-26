"use strict";
const bcrypt = require("bcryptjs");

module.exports = {
  async up(queryInterface, Sequelize) {
    const admin = await queryInterface.rawSelect(
      "Users",
      {
        where: { email: "admin@example.com" },
      },
      ["id"]
    );
    if (admin) {
      console.log("Admin ya existe, saltando seed.");
      return;
    }
    const hashedPassword = await bcrypt.hash("admin123", 10);

    return queryInterface.bulkInsert("Users", [
      {
        email: "admin@example.com",
        username: "admin",
        password: hashedPassword,
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    return queryInterface.bulkDelete(
      "Users",
      { email: "admin@example.com" },
      {}
    );
  },
};
