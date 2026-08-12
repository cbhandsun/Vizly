import React from 'react';
import { Button, Empty } from 'antd';
import { useTranslation } from 'react-i18next';

interface CloudStorageEmptyStateProps {
    hasUnfilteredItems: boolean;
    searchTerm: string;
    defaultDescription: string;
    onClearSearch: () => void;
}

export const CloudStorageEmptyState: React.FC<CloudStorageEmptyStateProps> = ({
    hasUnfilteredItems,
    searchTerm,
    defaultDescription,
    onClearSearch,
}) => {
    const { t } = useTranslation();
    const normalizedSearchTerm = searchTerm.trim();
    const isSearchEmpty = hasUnfilteredItems && normalizedSearchTerm.length > 0;

    return (
        <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={isSearchEmpty
                ? t('storage.manager.noSearchResults', { query: normalizedSearchTerm })
                : defaultDescription}
        >
            {isSearchEmpty && (
                <Button onClick={onClearSearch}>
                    {t('storage.manager.clearSearch')}
                </Button>
            )}
        </Empty>
    );
};
