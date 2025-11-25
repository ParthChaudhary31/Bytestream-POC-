import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface IBalanceEvent {
  id?: number;
  address: string;
  userAddress?: string | null;
  hubAddress?: string | null;
  previousBalance: number;
  currentBalance: number;
  change: number;
  confirmed: number;
  unconfirmed: number;
  utxoCount: number;
  timestamp: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface BalanceEventCreationAttributes extends Optional<IBalanceEvent, 'id' | 'createdAt' | 'updatedAt' | 'timestamp'> {}

export class BalanceEvent extends Model<IBalanceEvent, BalanceEventCreationAttributes> implements IBalanceEvent {
  public id!: number;
  public address!: string;
  public userAddress?: string | null;
  public hubAddress?: string | null;
  public previousBalance!: number;
  public currentBalance!: number;
  public change!: number;
  public confirmed!: number;
  public unconfirmed!: number;
  public utxoCount!: number;
  public timestamp!: Date;
  public createdAt!: Date;
  public updatedAt!: Date;
}

export const initBalanceEvent = (sequelize: Sequelize): typeof BalanceEvent => {
  BalanceEvent.init(
  {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
    address: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    userAddress: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    hubAddress: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    previousBalance: {
        type: DataTypes.BIGINT,
        allowNull: false,
    },
    currentBalance: {
        type: DataTypes.BIGINT,
        allowNull: false,
    },
    change: {
        type: DataTypes.BIGINT,
        allowNull: false,
    },
    confirmed: {
        type: DataTypes.BIGINT,
        allowNull: false,
    },
    unconfirmed: {
        type: DataTypes.BIGINT,
        allowNull: false,
    },
    utxoCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    timestamp: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
  },
  {
      sequelize,
      tableName: 'balance_events',
      timestamps: true,
      indexes: [
        {
          fields: ['address', 'timestamp'],
        },
        {
          fields: ['createdAt'],
        },
        {
          fields: ['change'],
        },
        {
          fields: ['userAddress'],
        },
        {
          fields: ['hubAddress'],
        },
      ],
    }
  );
  return BalanceEvent;
};

