/**
 * PageContent Component
 * 頁面內容組件
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS } from '../constants/theme';

interface PageContentProps {
    title: string;
    description: string;
    icon?: string;
}

export const PageContent: React.FC<PageContentProps> = ({ title, description, icon }) => {
    return (
        <View style={styles.pageContent}>
            <Text style={styles.pageTitle}>
                {icon && `${icon} `}{title}
            </Text>
            <Text style={styles.pageDescription}>{description}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    pageContent: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: SPACING.xl,
        paddingBottom: 120,
    },
    pageTitle: {
        fontSize: FONT_SIZES.xl,
        fontWeight: FONT_WEIGHTS.bold,
        color: COLORS.white,
        marginBottom: SPACING.lg,
    },
    pageDescription: {
        fontSize: FONT_SIZES.md,
        color: COLORS.white,
        textAlign: 'center',
        lineHeight: 28,
        opacity: 0.9,
    },
});
