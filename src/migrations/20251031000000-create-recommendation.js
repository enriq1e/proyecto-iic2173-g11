'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Recommendations', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      userId: { type: Sequelize.STRING, allowNull: false },
      basePropertyId: { type: Sequelize.INTEGER, allowNull: false },
      recommendationIds: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      createdAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updatedAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('Recommendations', ['userId']);
    await queryInterface.addIndex('Recommendations', ['userId', 'basePropertyId'], { unique: true, name: 'uniq_user_baseproperty' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('Recommendations');
  }
};
