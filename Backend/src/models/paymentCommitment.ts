import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface IPaymentCommitment {
  id?: number;
  commitmentId: string; // Unique commitment identifier
  senderChannelId: string; // Sender's channel ID
  recipientChannelId: string; // Recipient's channel ID
  senderAddress: string; // Sender's address
  recipientAddress: string; // Recipient's address
  amount: number; // Payment amount (sats)
  utxoTxid?: string | null; // Transaction ID that created this UTXO
  utxoVout?: number | null; // Output index of the UTXO
  taprootAddress: string; // Taproot address where UTXO is stored (same for all commitments in a channel)
  status: 'pending' | 'committed' | 'spent' | 'expired'; // Commitment status
  commitmentNumber: number; // Commitment number for ordering
  createdAt?: Date;
  updatedAt?: Date;
}

interface PaymentCommitmentCreationAttributes extends Optional<IPaymentCommitment, 'id' | 'createdAt' | 'updatedAt' | 'utxoTxid' | 'utxoVout'> {}

export class PaymentCommitment extends Model<IPaymentCommitment, PaymentCommitmentCreationAttributes> implements IPaymentCommitment {
  public id!: number;
  public commitmentId!: string;
  public senderChannelId!: string;
  public recipientChannelId!: string;
  public senderAddress!: string;
  public recipientAddress!: string;
  public amount!: number;
  public utxoTxid?: string | null;
  public utxoVout?: number | null;
  public taprootAddress!: string;
  public status!: 'pending' | 'committed' | 'spent' | 'expired';
  public commitmentNumber!: number;
  public createdAt!: Date;
  public updatedAt!: Date;
}

export const initPaymentCommitment = (sequelize: Sequelize): typeof PaymentCommitment => {
  PaymentCommitment.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      commitmentId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      senderChannelId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      recipientChannelId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      senderAddress: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      recipientAddress: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      utxoTxid: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      utxoVout: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      taprootAddress: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('pending', 'committed', 'spent', 'expired'),
        allowNull: false,
        defaultValue: 'pending',
      },
      commitmentNumber: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      sequelize,
      tableName: 'payment_commitments',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['commitmentId'],
        },
        {
          fields: ['senderChannelId', 'status'],
        },
        {
          fields: ['recipientChannelId', 'status'],
        },
        {
          fields: ['senderAddress', 'recipientAddress'],
        },
        {
          fields: ['utxoTxid', 'utxoVout'],
        },
        {
          fields: ['taprootAddress', 'status'],
        },
        {
          fields: ['status'],
        },
      ],
    }
  );
  return PaymentCommitment;
};

