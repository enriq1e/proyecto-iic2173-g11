'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('PurchaseIntents', {
      id:             { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      request_id:     { type: Sequelize.STRING, allowNull: false, unique: true },
      group_id:       { type: Sequelize.STRING, allowNull: false },
      url:            { type: Sequelize.STRING, allowNull: false },
      origin:         { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      operation:      { type: Sequelize.STRING, allowNull: false, defaultValue: 'BUY' },
      status:         { type: Sequelize.STRING, allowNull: false, defaultValue: 'PENDING' },
      price_amount:   { type: Sequelize.DECIMAL(18,2), allowNull: false },
      price_currency: { type: Sequelize.STRING, allowNull: false, defaultValue: 'CLP' },
      email:          { type: Sequelize.STRING, allowNull: false },

      propertieId: {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'Properties', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'CASCADE'
      },

      createdAt:      { allowNull: false, type: Sequelize.DATE },
      updatedAt:      { allowNull: false, type: Sequelize.DATE },
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('PurchaseIntents');
  }
};
