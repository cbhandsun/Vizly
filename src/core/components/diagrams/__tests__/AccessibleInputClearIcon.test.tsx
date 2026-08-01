// @vitest-environment jsdom

import React, { useState } from 'react';
import { Input } from 'antd';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AccessibleInputClearIcon } from '../AccessibleInputClearIcon';

const SearchInput = () => {
    const [value, setValue] = useState('Decision');

    return (
        <Input
            aria-label="搜索节点"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            allowClear={{ clearIcon: <AccessibleInputClearIcon label="清除搜索" /> }}
        />
    );
};

describe('AccessibleInputClearIcon', () => {
    it('gives the generated clear button a stable accessible name', () => {
        render(<SearchInput />);

        const clearButton = screen.getByRole('button', { name: '清除搜索' });
        fireEvent.click(clearButton);

        const input = screen.getByRole('textbox', { name: '搜索节点' }) as HTMLInputElement;
        expect(input.value).toBe('');
    });
});
