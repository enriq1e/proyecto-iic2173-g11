'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('EventLogs', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },

      //properties/info|requests|validation
      topic: {                             
        type: Sequelize.STRING,
        allowNull: false
      },
      //info|request|validation
      event_type: {                        
        type: Sequelize.STRING,
        allowNull: false
      },

      //timestamp del evento
      timestamp: {
        allowNull: false,
        type: Sequelize.DATE
      },


      url: {                               
        type: Sequelize.STRING,
        allowNull: true
      },

      //request_id será un UUIDv4
      request_id: {                        
        type: Sequelize.UUID,
        allowNull: true
      },
      group_id: {
        type: Sequelize.STRING,
        allowNull: true
      },
      //por ahora es 0 siempre
      origin: {                            
        type: Sequelize.INTEGER,
        allowNull: true
      },
      // por ahora es "BUY" siempre
      operation: {                        
        type: Sequelize.STRING,
        allowNull: true
      },

      //ACCEPTED|OK|error|REJECTED
      status: {                           
        type: Sequelize.STRING,
        allowNull: true
      },
      //razon de status
      reason: {
        type: Sequelize.STRING,
        allowNull: true
      },

      // Copia del mensaje
      raw: {
        type: Sequelize.JSONB,
        allowNull: false
      },

      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW')
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW')
      }
    });

    await queryInterface.addIndex('EventLogs', ['topic', 'event_type']);
    await queryInterface.addIndex('EventLogs', ['request_id']);
    await queryInterface.addIndex('EventLogs', ['url']);
    await queryInterface.addIndex('EventLogs', ['timestamp']);
  },

  async down (queryInterface) {
    await queryInterface.dropTable('EventLogs');
  }
};
