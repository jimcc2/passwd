from django.contrib.auth.models import User
from rest_framework import serializers
from .models import Credential
from .encryption import encrypt_data, decrypt_data

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'password')
        extra_kwargs = {'password': {'write_only': True}}

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            password=validated_data['password']
        )
        return user

class CredentialSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True)
    mfa_secret = serializers.CharField(write_only=True, required=False, allow_blank=True)
    has_mfa = serializers.SerializerMethodField()

    class Meta:
        model = Credential
        fields = ('id', 'website_url', 'username', 'password', 'mfa_secret', 'has_mfa')
        read_only_fields = ('user',)

    def get_has_mfa(self, obj):
        return bool(obj.encrypted_mfa_secret)

    def create(self, validated_data):
        if 'password' in validated_data:
            validated_data['encrypted_password'] = encrypt_data(validated_data.pop('password'))
        if 'mfa_secret' in validated_data and validated_data['mfa_secret']:
            validated_data['encrypted_mfa_secret'] = encrypt_data(validated_data.pop('mfa_secret'))
        else:
            # Ensure mfa_secret is not in validated_data if it's empty
            validated_data.pop('mfa_secret', None)

        return Credential.objects.create(**validated_data)

    def update(self, instance, validated_data):
        if 'password' in validated_data:
            instance.encrypted_password = encrypt_data(validated_data.pop('password'))
        if 'mfa_secret' in validated_data and validated_data['mfa_secret']:
            instance.encrypted_mfa_secret = encrypt_data(validated_data.pop('mfa_secret'))
        
        instance.website_url = validated_data.get('website_url', instance.website_url)
        instance.username = validated_data.get('username', instance.username)
        instance.save()
        return instance

    def to_representation(self, instance):
        """
        Decrypt password for sending back to the client, but only the password.
        MFA secret is not sent back, only the 'has_mfa' flag.
        """
        representation = super().to_representation(instance)
        representation['password'] = decrypt_data(instance.encrypted_password)
        # DO NOT send back the mfa_secret, even decrypted.
        representation.pop('mfa_secret', None) 
        return representation
