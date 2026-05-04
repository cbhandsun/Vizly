import sys

file_path = r'e:\DEV\WorkSpace\Antigravity-WS\Vizly\src\core\components\diagrams\ModernFlowchartToolbar.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

start_line = 519 - 1
end_line = 696 - 1

new_content = """                {/* ── Pill 2: 历史与视图 (History & Viewport) ── */}
                <div className={`flex items-center gap-1 bg-[rgba(255,255,255,0.72)] dark:bg-[rgba(28,28,41,0.65)] backdrop-blur-[24px] backdrop-saturate-[180%] border border-[rgba(255,255,255,0.45)] dark:border-[rgba(255,255,255,0.12)] rounded-[16px] px-3 py-1.5 ${isDragging ? 'shadow-[0_20px_60px_rgba(0,0,0,0.25)]' : 'shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1)]'} pointer-events-auto`} style={{ pointerEvents: 'auto' }}>
                    {/* 历史 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                        <Tooltip title={t('designer.toolbar.undo')}>
                            <Button type="text" icon={<FaUndo />} onClick={onUndo} disabled={!canUndo} aria-label={t('designer.toolbar.undo')} style={{ borderRadius: '6px 0 0 6px' }} />
                        </Tooltip>
                        {onShowHistory && (
                            <Tooltip title={historyCount ? t('designer.toolbar.historyWithCount', { count: historyCount }) : t('designer.toolbar.historyPanel')}>
                                <Button
                                    type="text"
                                    size="small"
                                    onClick={onShowHistory}
                                    aria-label={t('designer.toolbar.historyPanel')}
                                    style={{
                                        width: 14, height: 32, padding: 0, borderRadius: '0 6px 6px 0', fontSize: 8,
                                        color: historyCount ? '#6366f1' : 'rgba(0,0,0,0.3)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        borderLeft: '1px solid rgba(0,0,0,0.08)', marginLeft: 0,
                                    }}
                                >
                                    ▾
                                </Button>
                            </Tooltip>
                        )}
                    </div>
                    <Tooltip title={t('designer.toolbar.redo')}>
                        <Button type="text" icon={<FaRedo />} onClick={onRedo} disabled={!canRedo} aria-label={t('designer.toolbar.redo')} />
                    </Tooltip>

                    {/* 视图控制 & 缩放比例 */}
                    {!hideZoomControls && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Tooltip title={t('designer.toolbar.zoomIn')}>
                                <Button type="text" icon={<FaSearchPlus />} onClick={onZoomIn} aria-label={t('designer.toolbar.zoomIn')} />
                            </Tooltip>
                            <Tooltip title={t('designer.toolbar.zoomOut')}>
                                <Button type="text" icon={<FaSearchMinus />} onClick={onZoomOut} aria-label={t('designer.toolbar.zoomOut')} />
                            </Tooltip>
                            <Tooltip title={t('designer.toolbar.fitView')}>
                                <Button type="text" icon={<FaCompressArrowsAlt />} onClick={onFitView} aria-label={t('designer.toolbar.fitView')} />
                            </Tooltip>
                            {onFitWidth && (
                                <Tooltip title={t('designer.toolbar.fitWidth', '适应宽度')}>
                                    <Button type="text" icon={<FaArrowsAltH />} onClick={onFitWidth} aria-label={t('designer.toolbar.fitWidth', '适应宽度')} />
                                </Tooltip>
                            )}
                            {zoomPercent !== undefined && (
                                <span style={{ fontFamily: 'monospace', minWidth: 36, textAlign: 'right', fontSize: 12, color: 'rgba(0,0,0,0.45)', marginLeft: 4 }}>{zoomPercent}%</span>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Pill 3: 智能排版与 AI (Smart Actions) ── */}
                <div className={`flex items-center gap-1 bg-[rgba(255,255,255,0.72)] dark:bg-[rgba(28,28,41,0.65)] backdrop-blur-[24px] backdrop-saturate-[180%] border border-[rgba(255,255,255,0.45)] dark:border-[rgba(255,255,255,0.12)] rounded-[16px] px-3 py-1.5 ${isDragging ? 'shadow-[0_20px_60px_rgba(0,0,0,0.25)]' : 'shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1)]'} pointer-events-auto`} style={{ pointerEvents: 'auto' }}>
                    {/* 布局 + 路由 */}
                    {!hideLayoutControls && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Dropdown menu={{ items: layoutMenu, selectedKeys: selectedLayoutKeys, selectable: true }} placement="top">
                                <Tooltip title={t('designer.flowchart.layout.tooltip')}>
                                    <Button type="text" icon={<FaSitemap />} aria-label={t('designer.flowchart.layout.tooltip')} />
                                </Tooltip>
                            </Dropdown>
                            <Tooltip title={`${t('designer.toolbar.autoRouting')} (${autoRouting ? onLabel : offLabel})`}>
                                <Button
                                    type={autoRouting ? 'primary' : 'text'}
                                    ghost={autoRouting}
                                    icon={<FaMagic />}
                                    onClick={toggleAutoRouting}
                                    aria-label={`${t('designer.toolbar.autoRouting')} (${autoRouting ? onLabel : offLabel})`}
                                    aria-pressed={autoRouting}
                                />
                            </Tooltip>
                        </div>
                    )}

                    {/* 主链路 */}
                    {!hideFlowFocusControls && onToggleHighlightMainFlow && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Tooltip title={highlightMainFlow ? t('designer.toolbar.unhighlightMainFlow') : t('designer.toolbar.highlightMainFlow')}>
                                <Button
                                    type={highlightMainFlow ? 'primary' : 'text'}
                                    ghost={highlightMainFlow}
                                    icon={<FaProjectDiagram />}
                                    onClick={onToggleHighlightMainFlow}
                                    aria-label={highlightMainFlow ? t('designer.toolbar.unhighlightMainFlow') : t('designer.toolbar.highlightMainFlow')}
                                    aria-pressed={highlightMainFlow}
                                />
                            </Tooltip>
                            {onToggleShowOnlyMainFlow && (
                                <Tooltip title={showOnlyMainFlow ? t('designer.toolbar.restoreFullFlow') : t('designer.toolbar.showOnlyMainFlow')}>
                                    <Button
                                        type={showOnlyMainFlow ? 'primary' : 'text'}
                                        ghost={showOnlyMainFlow}
                                        icon={<FaSitemap />}
                                        onClick={onToggleShowOnlyMainFlow}
                                    />
                                </Tooltip>
                            )}
                        </div>
                    )}

                    {/* AI 助手 */}
                    {onToggleAI && (
                        <Tooltip title={<>{t('aiChat.title')} {showAiCrown && <span style={{  fontSize: '13px' }} title={t('common.proFeature')}>👑</span>}</>}>
                            <Button
                                type={aiChatActive ? 'primary' : 'text'}
                                ghost={aiChatActive}
                                icon={<RobotOutlined />}
                                onClick={onToggleAI}
                                aria-label={t('aiChat.title')}
                                aria-pressed={aiChatActive}
                            />
                        </Tooltip>
                    )}
                </div>

                {/* ── Pill 4: 选项与状态 (Settings & Options) ── */}
                <div className={`flex items-center gap-1 bg-[rgba(255,255,255,0.72)] dark:bg-[rgba(28,28,41,0.65)] backdrop-blur-[24px] backdrop-saturate-[180%] border border-[rgba(255,255,255,0.45)] dark:border-[rgba(255,255,255,0.12)] rounded-[16px] px-3 py-1.5 ${isDragging ? 'shadow-[0_20px_60px_rgba(0,0,0,0.25)]' : 'shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1)]'} pointer-events-auto`} style={{ pointerEvents: 'auto' }}>
                    {/* 网格吸附 & 选中节点数 */}
                    {!hideGridControls && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(0,0,0,0.45)', whiteSpace: 'nowrap' }}>
                            {onToggleSnap && (
                                <Tooltip title={snapToGrid ? t('designer.toolbar.snapOn') : t('designer.toolbar.snapOff')}>
                                    <Button
                                        type="text"
                                        size="small"
                                        className={`toolbar-status-btn ${snapToGrid ? 'active' : ''}`}
                                        onClick={onToggleSnap}
                                        icon={<FaMagnet size={10} />}
                                        style={{
                                            color: snapToGrid ? '#1890ff' : 'rgba(0,0,0,0.3)',
                                            fontSize: 10, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                                        }}
                                    />
                                </Tooltip>
                            )}
                            {(selectedNodesCount || 0) > 0 && (
                                <span style={{ color: '#1890ff', fontWeight: 500, minWidth: 24, textAlign: 'center' }}>
                                    {selectedNodesCount}↗
                                </span>
                            )}
                        </div>
                    )}

                    {/* 更多菜单 */}
                    <Dropdown menu={{ items: moreMenuItems }} placement="top" trigger={['click']} styles={{ root: { minWidth: 220, whiteSpace: 'nowrap' } }}>
                        <Tooltip title={t('designer.toolbar.moreActions')}>
                            <Button type="text" icon={<FaEllipsisH />} aria-label={t('designer.toolbar.moreActions')} />
                        </Tooltip>
                    </Dropdown>

                    {/* 自定义扩展 (通常是主题切换器) */}
                    {children && (
                        <div style={{ marginLeft: 4, display: 'flex', alignItems: 'center' }}>
                            {children}
                        </div>
                    )}
                </div>
"""

new_lines = new_content.splitlines(True)
lines[start_line:end_line + 1] = new_lines

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(lines)
