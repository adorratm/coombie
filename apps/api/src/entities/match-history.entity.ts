import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('match_history')
export class MatchHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  roomCode!: string;

  @Column()
  mode!: string;

  @Column({ type: 'int' })
  peakLevel!: number;

  @Column({ type: 'simple-json' })
  playerIds!: string[];

  @Column({ default: 'completed' })
  result!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
