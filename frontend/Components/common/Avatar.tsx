import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

interface AvatarProps {
  letter: string;
  avatarUrl?: string | null;
  size?: number;
}

export const Avatar = ({ letter, avatarUrl, size = 48 }: AvatarProps) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Show image only if URL exists, image loaded successfully, and no error
  const showImage = avatarUrl && !imageError && imageLoaded;
  const showLetter = !avatarUrl || imageError || !imageLoaded;

  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {/* Always render Image if avatarUrl exists to start loading */}
      {avatarUrl && !imageError && (
        <Image
          source={{ uri: avatarUrl }}
          style={[
            styles.image,
            { width: size, height: size, borderRadius: size / 2 },
            !showImage && styles.hiddenImage, // Hide while loading
          ]}
          onLoad={() => setImageLoaded(true)}
          onError={() => {
            setImageError(true);
            setImageLoaded(false);
          }}
        />
      )}
      {/* Show letter as fallback or while image is loading */}
      {showLetter && (
        <Text style={[styles.letter, { fontSize: size * 0.375 }]}>
          {letter.toUpperCase()}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: '#0066ff',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  hiddenImage: {
    position: 'absolute',
    opacity: 0,
  },
  letter: {
    color: '#fff',
    fontWeight: 'bold',
  },
});