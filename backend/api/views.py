from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from .models import Credential
from .serializers import CredentialSerializer, UserSerializer
from .encryption import decrypt_data
import pyotp

class RegisterView(generics.CreateAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = UserSerializer

class CredentialListCreate(generics.ListCreateAPIView):
    serializer_class = CredentialSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Credential.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class CredentialRetrieveUpdateDestroy(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CredentialSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Credential.objects.filter(user=self.request.user)

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def get_totp(request, pk):
    try:
        credential = Credential.objects.get(pk=pk, user=request.user)
        if not credential.encrypted_mfa_secret:
            return Response({'error': 'MFA secret not set for this credential'}, status=status.HTTP_400_BAD_REQUEST)
        
        decrypted_secret = decrypt_data(credential.encrypted_mfa_secret)
        totp = pyotp.TOTP(decrypted_secret)
        
        return Response({'totp': totp.now()})
        
    except Credential.DoesNotExist:
        return Response({'error': 'Credential not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
