'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Si quieres agregar una columna nueva:
    await queryInterface.addColumn('PurchaseIntents', 'custom_price_amount', {
      type: Sequelize.DECIMAL(18,2),
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface, Sequelize) {
    // Revertir la columna agregada
    await queryInterface.removeColumn('PurchaseIntents', 'custom_price_amount');
  }
};
