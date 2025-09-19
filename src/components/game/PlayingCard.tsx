"use client";
import React from 'react';

import { Card } from '../../../shared/types/game';

export default function PlayingCard({ card, onClick, disabled=false, className='', size='medium' }: {
  card: Card;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  size?: 'small'|'medium'|'large';
}) {
  const sizeClasses: Record<string,string> = {
    small: 'w-8 h-11 text-xs',
    medium: 'w-12 h-16 text-sm',
    large: 'w-16 h-22 text-base'
  };
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const cardBg = isRed ? 'bg-gradient-to-br from-white via-red-50 to-white' : 'bg-gradient-to-br from-white via-blue-50 to-white';
  const color = isRed ? 'text-red-600' : 'text-black';
  const display = `${card.rank}${card.suit === 'hearts' ? '♥️' : card.suit === 'diamonds' ? '♦️' : card.suit === 'clubs' ? '♣️' : '♠️'}`;
  return (
    <div
      onClick={() => { if (!disabled && onClick) onClick(); }}
      className={`${sizeClasses[size]} ${cardBg} border-2 border-white/70 rounded-xl flex flex-col items-center justify-between p-2 shadow-xl transition-all duration-300 relative overflow-hidden ${!disabled && onClick ? 'hover:shadow-2xl hover:border-cyan-400/70 cursor-pointer hover:scale-110 hover:rotate-1' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      <div className={`self-start ${color} font-black`}>{display}</div>
      <div className={`text-3xl ${color}`}>{display.slice(1)}</div>
      <div className={`self-end rotate-180 ${color} font-black`}>{display}</div>
    </div>
  );
}


