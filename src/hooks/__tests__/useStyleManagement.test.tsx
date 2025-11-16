import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useStyleManagement } from '../useStyleManagement';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

vi.mock('../../lib/supabaseClient');
vi.mock('../../contexts/AuthContext');

describe('useStyleManagement', () => {
  const mockUser = { id: 'user-123' };
  
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: mockUser,
      login: vi.fn(),
      logout: vi.fn(),
      loading: false,
    });
  });

  it('should initialize with correct default state', () => {
    const { result } = renderHook(() => useStyleManagement());

    expect(result.current.styles).toEqual([]);
    expect(result.current.stylesLoading).toBe(false);
  });

  it('should load styles successfully', async () => {
    const mockStyles = [
      { id: '1', name: 'Style 1', prompt: 'test prompt 1', user_id: 'user-123' },
      { id: '2', name: 'Style 2', prompt: 'test prompt 2', user_id: 'user-123' }
    ];
    
    const mockResponse = {
      data: mockStyles,
      error: null
    };
    
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue(mockResponse)
        })
      })
    } as any);

    const { result } = renderHook(() => useStyleManagement());

    await waitFor(async () => {
      await result.current.loadStyles();
    });

    expect(result.current.styles).toEqual(mockStyles);
    expect(result.current.stylesLoading).toBe(false);
  });

  it('should handle load styles errors', async () => {
    const mockError = { message: 'Database error' };
    const onError = vi.fn();
    
    const mockResponse = {
      data: null,
      error: mockError
    };
    
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue(mockResponse)
        })
      })
    } as any);

    const { result } = renderHook(() => useStyleManagement({ onError }));

    await waitFor(async () => {
      await result.current.loadStyles();
    });

    expect(onError).toHaveBeenCalledWith(expect.stringContaining('スタイルの読み込みに失敗しました'));
    expect(result.current.stylesLoading).toBe(false);
  });

  it('should save style successfully', async () => {
    const mockStyle = { 
      id: '1', 
      name: 'New Style', 
      prompt: 'new prompt', 
      user_id: 'user-123' 
    };
    
    const mockResponse = {
      data: [mockStyle],
      error: null
    };
    
    vi.mocked(supabase.from).mockReturnValue({
      upsert: vi.fn().mockResolvedValue(mockResponse)
    } as any);

    const { result } = renderHook(() => useStyleManagement());

    await waitFor(async () => {
      await result.current.saveStyle(mockStyle);
    });

    expect(supabase.from).toHaveBeenCalledWith('styles');
  });

  it('should handle save style errors', async () => {
    const mockStyle = { 
      id: '1', 
      name: 'New Style', 
      prompt: 'new prompt', 
      user_id: 'user-123' 
    };
    const mockError = { message: 'Save failed' };
    const onError = vi.fn();
    
    const mockResponse = {
      data: null,
      error: mockError
    };
    
    vi.mocked(supabase.from).mockReturnValue({
      upsert: vi.fn().mockResolvedValue(mockResponse)
    } as any);

    const { result } = renderHook(() => useStyleManagement({ onError }));

    await waitFor(async () => {
      await result.current.saveStyle(mockStyle);
    });

    expect(onError).toHaveBeenCalledWith(expect.stringContaining('スタイルの保存に失敗しました'));
  });

  it('should delete style successfully', async () => {
    const styleId = 'style-123';
    
    const mockResponse = {
      data: [],
      error: null
    };
    
    vi.mocked(supabase.from).mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(mockResponse)
        })
      })
    } as any);

    const { result } = renderHook(() => useStyleManagement());

    await waitFor(async () => {
      await result.current.deleteStyle(styleId);
    });

    expect(supabase.from).toHaveBeenCalledWith('styles');
  });

  it('should handle delete style errors', async () => {
    const styleId = 'style-123';
    const mockError = { message: 'Delete failed' };
    const onError = vi.fn();
    
    const mockResponse = {
      data: null,
      error: mockError
    };
    
    vi.mocked(supabase.from).mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(mockResponse)
        })
      })
    } as any);

    const { result } = renderHook(() => useStyleManagement({ onError }));

    await waitFor(async () => {
      await result.current.deleteStyle(styleId);
    });

    expect(onError).toHaveBeenCalledWith(expect.stringContaining('スタイルの削除に失敗しました'));
  });

  it('should add style successfully', async () => {
    const newStyle = { 
      name: 'New Style', 
      prompt: 'new prompt'
    };
    
    const createdStyle = {
      id: 'generated-id',
      ...newStyle,
      user_id: 'user-123',
      created_at: new Date().toISOString()
    };
    
    const mockResponse = {
      data: [createdStyle],
      error: null
    };
    
    vi.mocked(supabase.from).mockReturnValue({
      insert: vi.fn().mockResolvedValue(mockResponse)
    } as any);

    const { result } = renderHook(() => useStyleManagement());

    await waitFor(async () => {
      await result.current.addStyle(newStyle);
    });

    expect(supabase.from).toHaveBeenCalledWith('styles');
  });

  it('should handle add style errors', async () => {
    const newStyle = { 
      name: 'New Style', 
      prompt: 'new prompt'
    };
    const mockError = { message: 'Insert failed' };
    const onError = vi.fn();
    
    const mockResponse = {
      data: null,
      error: mockError
    };
    
    vi.mocked(supabase.from).mockReturnValue({
      insert: vi.fn().mockResolvedValue(mockResponse)
    } as any);

    const { result } = renderHook(() => useStyleManagement({ onError }));

    await waitFor(async () => {
      await result.current.addStyle(newStyle);
    });

    expect(onError).toHaveBeenCalledWith(expect.stringContaining('スタイルの追加に失敗しました'));
  });

  it('should not perform operations when user is not authenticated', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      login: vi.fn(),
      logout: vi.fn(),
      loading: false,
    });

    const { result } = renderHook(() => useStyleManagement());

    await waitFor(async () => {
      await result.current.loadStyles();
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });
});