import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MessageReactionChips, MessageReactionPicker } from './MessageReactions';

// Day 31: reacting to a message.
const nameOf = (id) => ({ 1: 'You', 2: 'bob', 3: 'carol' })[id];

describe('MessageReactionChips', () => {
  it('shows the most-used emojis first with the total, and says who reacted', () => {
    render(
      <MessageReactionChips
        reactions={[{ user_id: 2, reaction: 'love' }, { user_id: 1, reaction: 'haha' }, { user_id: 3, reaction: 'love' }]}
        nameOf={nameOf}
        onOpen={() => {}}
      />
    );
    const chip = screen.getByRole('button');
    expect(chip.textContent).toBe('❤️😆3');
    expect(chip).toHaveAccessibleName('Reactions — Love: bob, carol; Haha: You. Press to choose yours');
  });

  it('renders nothing without reactions', () => {
    const { container } = render(<MessageReactionChips reactions={[]} nameOf={nameOf} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('MessageReactionPicker', () => {
  const setup = (myReaction = null) => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    const trigger = createRef();
    render(
      <>
        <button ref={trigger}>open</button>
        <MessageReactionPicker myReaction={myReaction} onPick={onPick} onClose={onClose} returnFocusRef={trigger} />
      </>
    );
    return { onPick, onClose, trigger };
  };

  it('offers the six reactions and marks yours; focus starts on it', () => {
    setup('wow');
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Wow' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Wow' }));
  });

  it('picking one sends it and closes; picking yours again removes it', () => {
    const { onPick, onClose } = setup('like');
    fireEvent.click(screen.getByRole('button', { name: 'Love' }));
    expect(onPick).toHaveBeenLastCalledWith('love');
    expect(onClose).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Like' }));
    expect(onPick).toHaveBeenLastCalledWith(null);
  });

  it('arrow keys move along the row; Escape closes and returns focus', () => {
    const { onClose, trigger } = setup();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Like' }));
    fireEvent.keyDown(document.activeElement, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Love' }));
    fireEvent.keyDown(document.activeElement, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.activeElement, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Angry' }));
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger.current);
  });

  it('a click elsewhere closes it', () => {
    const { onClose } = setup();
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });
});
