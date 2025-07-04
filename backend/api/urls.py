from django.urls import path
from . import views
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

urlpatterns = [
    path('token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('register/', views.RegisterView.as_view(), name='auth_register'),
    path('credentials/', views.CredentialListCreate.as_view(), name='credential_list_create'),
    path('credentials/<int:pk>/', views.CredentialRetrieveUpdateDestroy.as_view(), name='credential_detail'),
    path('credentials/<int:pk>/totp/', views.get_totp, name='get_totp'),
]
