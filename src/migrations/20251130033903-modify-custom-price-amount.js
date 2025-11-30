"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("PurchaseIntents", "custom_price_amount", {
      type: Sequelize.FLOAT,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("PurchaseIntents", "custom_price_amount", {
      type: Sequelize.DECIMAL(18,2),
      allowNull: false,
      defaultValue: 0,
    });
  },
};
